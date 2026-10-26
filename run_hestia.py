#!/usr/bin/env python3
"""Start Hestia with the current LAN address; run setup only when requested."""

from __future__ import annotations

import argparse
import os
import shlex
import shutil
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from urllib.error import URLError
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parent
SERVER = ROOT / "server"
MOBILE = ROOT / "mobile"


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip("\"'")
    return values


def ensure_db_url_options() -> None:
    """Add the Prisma settings needed by Supabase pooler URLs."""
    path = SERVER / ".env"
    required_options = {
        "DATABASE_URL": {"pgbouncer": "true", "sslmode": "require", "connection_limit": "5", "connect_timeout": "30"},
        "DIRECT_URL": {"sslmode": "require", "connect_timeout": "30"},
    }
    lines = path.read_text().splitlines()
    changed = False
    for index, line in enumerate(lines):
        key, separator, raw_value = line.partition("=")
        if not separator or key.strip() not in required_options:
            continue
        value = raw_value.strip().strip("\"'")
        parsed = urlsplit(value)
        options = dict(parse_qsl(parsed.query, keep_blank_values=True))
        original_options = options.copy()
        for name, setting in required_options[key.strip()].items():
            options.setdefault(name, setting)
        if options != original_options:
            updated = urlunsplit(parsed._replace(query=urlencode(options)))
            lines[index] = f"{key.strip()}={updated}"
            changed = True
    if changed:
        path.write_text("\n".join(lines) + "\n")
        print("Added missing Prisma connection options to server/.env.")


def edit_server_env() -> bool:
    env_path = SERVER / ".env"
    example_path = SERVER / ".env.example"
    if not env_path.exists():
        shutil.copyfile(example_path, env_path)
        print("Created server/.env from server/.env.example.")

    required = {
        "DATABASE_URL": "your Supabase pooled Postgres URL",
        "DIRECT_URL": "your Supabase direct Postgres URL",
        "SUPABASE_URL": "your Supabase project URL",
        "SUPABASE_SECRET_KEY": "your server-only Supabase secret key",
        "CORS_ORIGINS": "the allowed local web origins (keep the example value)",
    }
    placeholders = ("PROJECT_REF", "URL_ENCODED_PASSWORD", "REPLACE_ME", "your-project")
    values = read_env(env_path)
    missing = [key for key in required if not values.get(key) or any(p in values[key] for p in placeholders)]
    if missing:
        print("\nFill these settings in server/.env before continuing:")
        for key in missing:
            print(f"  {key}: {required[key]}")
        editor = shlex.split(os.environ.get("EDITOR", "nano"))
        try:
            subprocess.run([*editor, str(env_path)], check=False)
        except FileNotFoundError:
            print("No text editor was found. Open server/.env, fill the settings, then run this script again.")
            return False
        values = read_env(env_path)
        missing = [key for key in required if not values.get(key) or any(p in values[key] for p in placeholders)]
        if missing:
            print("\nStill missing or using example values: " + ", ".join(missing))
            print("Save server/.env and run this script again.")
            return False

    if not values.get("DATABASE_URL", "").startswith("postgresql://"):
        print("DATABASE_URL must be a postgresql:// URL in server/.env.")
        return False
    if not values.get("DIRECT_URL", "").startswith("postgresql://"):
        print("DIRECT_URL must be a postgresql:// URL in server/.env.")
        return False
    if not values.get("SUPABASE_URL", "").startswith("https://"):
        print("SUPABASE_URL must be an https:// URL in server/.env.")
        return False
    if not values.get("SUPABASE_SECRET_KEY", "").startswith("sb_secret_"):
        print("SUPABASE_SECRET_KEY must be a server-only sb_secret_ key in server/.env.")
        return False
    return True


def local_ip() -> str | None:
    # UDP connect selects the active route without sending a request.
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            address = sock.getsockname()[0]
            if not address.startswith("127."):
                return address
    except OSError:
        pass
    return None


def set_mobile_api_url(host: str, port: int) -> bool:
    path = MOBILE / ".env"
    if not path.exists():
        example = MOBILE / ".env.example"
        if not example.exists():
            raise FileNotFoundError("mobile/.env.example is missing.")
        shutil.copyfile(example, path)

    lines = path.read_text().splitlines()
    key = "EXPO_PUBLIC_API_BASE_URL"
    replacement = f"{key}=http://{host}:{port}"
    found = False
    for index, line in enumerate(lines):
        if line.strip().startswith(f"{key}="):
            lines[index] = replacement
            found = True
            break
    if not found:
        lines.append(replacement)
    if read_env(path).get(key) == f"http://{host}:{port}":
        print(f"Mobile API address is current: http://{host}:{port}")
        return False
    path.write_text("\n".join(lines) + "\n")
    print(f"Updated mobile/.env {key} to http://{host}:{port}")
    return True


def run(command: list[str], cwd: Path) -> None:
    print("\n$ " + " ".join(command), flush=True)
    subprocess.run(command, cwd=cwd, check=True)


def stop_process(process: subprocess.Popen[bytes] | None) -> None:
    if process is None or process.poll() is not None:
        return
    try:
        if os.name == "posix":
            os.killpg(process.pid, signal.SIGINT)
        else:
            process.send_signal(signal.CTRL_BREAK_EVENT)
        process.wait(timeout=5)
    except (OSError, subprocess.TimeoutExpired):
        process.terminate()
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()


def wait_for_api(process: subprocess.Popen[bytes], port: int) -> bool:
    url = f"http://127.0.0.1:{port}/health"
    for _ in range(40):
        if process.poll() is not None:
            print("The API process stopped before it became ready.")
            return False
        try:
            with urlopen(url, timeout=1) as response:
                if response.status == 200:
                    print(f"API is ready: {url}")
                    return True
        except (OSError, URLError):
            time.sleep(0.5)
    print(f"The API did not respond at {url}. Check server/.env and the server output above.")
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Start Hestia API and Expo Go with one command.")
    parser.add_argument("--setup", action="store_true", help="Install dependencies, generate Prisma client, and deploy migrations before starting")
    parser.add_argument("--ip", help="Use this Mac LAN IP if automatic detection fails")
    args = parser.parse_args()

    if shutil.which("npm") is None:
        print("npm was not found. Install Node.js, then run this script again.")
        return 1

    if not edit_server_env():
        return 1
    ensure_db_url_options()

    mobile_values = read_env(MOBILE / ".env")
    for key in ("EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"):
        value = mobile_values.get(key, "")
        if not value or "your-project" in value or "replace_me" in value.lower():
            print(f"Set {key} in mobile/.env before continuing.")
            return 1

    ip = args.ip or local_ip()
    if not ip:
        print("Could not detect your Mac's LAN IP. Check your connection or pass --ip YOUR_MAC_IP.")
        return 1
    port = int(read_env(SERVER / ".env").get("PORT", "3000"))
    api_address_changed = set_mobile_api_url(ip, port)

    try:
        if args.setup:
            if not (SERVER / "node_modules").exists():
                run(["npm", "ci"], SERVER)
            if not (MOBILE / "node_modules").exists():
                run(["npm", "ci"], MOBILE)
            run(["npm", "run", "prisma:generate"], SERVER)
            run(["npm", "run", "db:migrate"], SERVER)
            run(["npm", "run", "build"], SERVER)
        elif not (SERVER / "node_modules").exists() or not (MOBILE / "node_modules").exists():
            print("Dependencies are missing. Run python3 run_hestia.py --setup once.")
            return 1
    except subprocess.CalledProcessError as error:
        print(f"Setup command failed with exit code {error.returncode}.")
        if error.cmd == ["npm", "run", "db:migrate"]:
            print("For a more specific database error, run: python3 check_database.py")
        return error.returncode or 1

    server_process: subprocess.Popen[bytes] | None = None
    expo_process: subprocess.Popen[bytes] | None = None
    try:
        try:
            with urlopen(f"http://127.0.0.1:{port}/health", timeout=1) as response:
                api_running = response.status == 200
        except (OSError, URLError):
            api_running = False
        if api_running:
            print("Hestia API is already running.", flush=True)
        else:
            print("\nStarting Hestia API...", flush=True)
            server_process = subprocess.Popen(
                ["npm", "run", "dev"], cwd=SERVER, start_new_session=(os.name == "posix")
            )
            if not wait_for_api(server_process, port):
                return 1

        print(f"On your phone, http://{ip}:{port}/health should show {{\"ok\":true}}.")
        print("\nStarting Expo. Scan its QR code with Expo Go; keep this window open.", flush=True)
        expo_process = subprocess.Popen(
            ["npx", "expo", "start", *(["--clear"] if api_address_changed else [])], cwd=MOBILE,
            start_new_session=(os.name == "posix"),
        )
        return expo_process.wait()
    except KeyboardInterrupt:
        print("\nStopping Hestia API and Expo...", flush=True)
        return 0
    finally:
        stop_process(expo_process)
        stop_process(server_process)


if __name__ == "__main__":
    sys.exit(main())
