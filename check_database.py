#!/usr/bin/env python3
"""Check the Hestia PostgreSQL login without printing database credentials."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import socket
import ssl
import struct
import sys
from urllib.parse import unquote, urlsplit

from run_hestia import SERVER, read_env


class DatabaseResponseError(Exception):
    pass


def receive_exact(connection: socket.socket | ssl.SSLSocket, size: int) -> bytes:
    chunks: list[bytes] = []
    while size:
        chunk = connection.recv(size)
        if not chunk:
            raise ConnectionError("The pooler closed the connection before replying.")
        chunks.append(chunk)
        size -= len(chunk)
    return b"".join(chunks)


def receive_message(connection: socket.socket | ssl.SSLSocket) -> tuple[bytes, bytes]:
    kind = receive_exact(connection, 1)
    length = struct.unpack("!I", receive_exact(connection, 4))[0]
    if length < 4 or length > 1_000_000:
        raise ValueError("The pooler sent an invalid PostgreSQL packet length.")
    return kind, receive_exact(connection, length - 4)


def send_message(connection: socket.socket | ssl.SSLSocket, kind: bytes, payload: bytes) -> None:
    connection.sendall(kind + struct.pack("!I", len(payload) + 4) + payload)


def server_error(payload: bytes) -> DatabaseResponseError:
    fields: dict[str, str] = {}
    for field in payload.rstrip(b"\x00").split(b"\x00"):
        if field:
            fields[field[:1].decode("ascii", "replace")] = field[1:].decode("utf-8", "replace")
    code = fields.get("C", "unknown")
    message = fields.get("M", "PostgreSQL rejected the connection")
    return DatabaseResponseError(f"PostgreSQL error {code}: {message}")


def check_database(key: str) -> None:
    value = read_env(SERVER / ".env").get(key, "")
    url = urlsplit(value)
    if not url.hostname or not url.username or not url.password or not url.path.strip("/"):
        raise ValueError(f"{key} in server/.env is incomplete.")
    password = unquote(url.password)
    username = unquote(url.username)
    database = url.path.lstrip("/")

    with socket.create_connection((url.hostname, url.port or 5432), timeout=15) as raw:
        raw.settimeout(15)
        print("TCP connection established.", flush=True)
        raw.sendall(struct.pack("!II", 8, 80877103))
        try:
            ssl_reply = receive_exact(raw, 1)
        except TimeoutError as error:
            raise TimeoutError("timed out waiting for the PostgreSQL SSL response") from error
        if ssl_reply != b"S":
            raise ConnectionError("The pooler did not accept PostgreSQL TLS.")
        # Match sslmode=require in server/.env: encrypt traffic without CA validation.
        # A configured sslrootcert can be used for certificate validation later.
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        with context.wrap_socket(raw, server_hostname=url.hostname) as connection:
            print("TLS connection established.", flush=True)
            startup = struct.pack("!I", 196608) + (
                f"user\x00{username}\x00database\x00{database}\x00"
                "application_name\x00hestia-db-check\x00client_encoding\x00UTF8\x00\x00"
            ).encode()
            connection.sendall(struct.pack("!I", len(startup) + 4) + startup)

            client_first_bare = ""
            expected_server_signature: bytes | None = None
            authenticated = False
            while True:
                kind, payload = receive_message(connection)
                if kind == b"E":
                    raise server_error(payload)
                if kind == b"R":
                    method = struct.unpack("!I", payload[:4])[0]
                    if method == 10:  # SASL mechanisms
                        if b"SCRAM-SHA-256\x00" not in payload[4:]:
                            raise ValueError("The pooler does not offer SCRAM-SHA-256 authentication.")
                        nonce = base64.b64encode(secrets.token_bytes(18)).decode()
                        client_first_bare = f"n=,r={nonce}"
                        first = f"n,,{client_first_bare}".encode()
                        send_message(connection, b"p", b"SCRAM-SHA-256\x00" + struct.pack("!I", len(first)) + first)
                    elif method == 11:  # SCRAM server-first message
                        server_first = payload[4:].decode()
                        fields = dict(part.split("=", 1) for part in server_first.split(","))
                        if not fields.get("r", "").startswith(client_first_bare.split("r=", 1)[1]):
                            raise ValueError("The pooler returned an invalid SCRAM nonce.")
                        salt = base64.b64decode(fields["s"])
                        iterations = int(fields["i"])
                        if not 1 <= iterations <= 1_000_000:
                            raise ValueError("The pooler returned an invalid SCRAM iteration count.")
                        salted = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations)
                        client_key = hmac.new(salted, b"Client Key", hashlib.sha256).digest()
                        stored_key = hashlib.sha256(client_key).digest()
                        final_without_proof = f"c=biws,r={fields['r']}"
                        auth_message = f"{client_first_bare},{server_first},{final_without_proof}".encode()
                        signature = hmac.new(stored_key, auth_message, hashlib.sha256).digest()
                        proof = bytes(a ^ b for a, b in zip(client_key, signature))
                        server_key = hmac.new(salted, b"Server Key", hashlib.sha256).digest()
                        expected_server_signature = hmac.new(server_key, auth_message, hashlib.sha256).digest()
                        final = f"{final_without_proof},p={base64.b64encode(proof).decode()}"
                        send_message(connection, b"p", final.encode())
                    elif method == 12:  # SCRAM server-final message
                        final_fields = dict(part.split("=", 1) for part in payload[4:].decode().split(","))
                        if "e" in final_fields:
                            raise DatabaseResponseError(f"SCRAM authentication failed: {final_fields['e']}")
                        received = base64.b64decode(final_fields.get("v", ""))
                        if expected_server_signature is None or not hmac.compare_digest(received, expected_server_signature):
                            raise ValueError("The pooler returned an invalid SCRAM signature.")
                    elif method == 0:
                        authenticated = True
                    else:
                        raise ValueError(f"The pooler requested unsupported authentication method {method}.")
                elif kind == b"Z":
                    if not authenticated:
                        raise ValueError("PostgreSQL became ready without authenticating.")
                    print("PostgreSQL authentication succeeded.", flush=True)
                    break

            send_message(connection, b"Q", b"SELECT 1\x00")
            while True:
                kind, payload = receive_message(connection)
                if kind == b"E":
                    raise server_error(payload)
                if kind == b"Z":
                    print("SELECT 1 succeeded. Database credentials and connection are working.")
                    return


if __name__ == "__main__":
    failures = 0
    for key, label in (("DIRECT_URL", "Session pooler (port 5432)"), ("DATABASE_URL", "Transaction pooler (port 6543)")):
        print(f"\nChecking {label}:", flush=True)
        try:
            check_database(key)
        except (DatabaseResponseError, ConnectionError, OSError, ValueError) as error:
            print(f"Database check failed: {error}")
            failures += 1
    sys.exit(1 if failures else 0)
