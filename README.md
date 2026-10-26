<div align="center">

# Hestia

**Shared inventory for households and small groups.**
Know what you have, where it is, and who's using it.

![Expo](https://img.shields.io/badge/Expo-React_Native-000020?logo=expo&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Prisma-4169E1?logo=postgresql&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Auth_%26_Storage-3ECF8E?logo=supabase&logoColor=white)

</div>

---

## Overview

Hestia is a mobile app for sharing things with the people you live or work with. It handles two kinds of items:

- **Consumables**: things that run out, like soap, coffee, or batteries. Hestia tracks quantity, records every use and restock, and alerts you when stock is low.
- **Returnables**: things that get lent out, like a drill, a ladder, or a camera. Hestia runs the whole borrowing workflow from request to return, so you always know who has what.

Everything lives inside a **Space** (a household, dorm, student org, or small office). Items can be shared with the Space or kept private to their owner. Every change is written to an append-only history.

The project has three parts:

| Part | Stack | Purpose |
| --- | --- | --- |
| `mobile/` | Expo, React Native, Expo Router, TanStack Query | The iOS, Android, and web client |
| `server/` | Express 5, Prisma 6, PostgreSQL, Zod | The API, the only client of application tables |
| Supabase | Auth, Postgres, private Storage | Identity, database hosting, and photo storage |

## Features

**Spaces and people**
- Email sign-up and sign-in through Supabase Auth
- Multiple Spaces per user (`household`, `dorm`, `student_org`, `small_office`)
- Admin and member roles
- Expiring invite codes in `XXXX-XXXX` format: 7-day expiry, revocable, rate limited
- Members can leave a Space. Removing a member or leaving is blocked while they have active loans, and the last admin must promote someone first.
- Admins can archive a Space. History is preserved.

**Items**
- Private and shared items with categories, locations, owners, and optional custodians
- Item photos in a private bucket, uploaded through signed upload tokens
- Search and filtering by name, category, location, kind, visibility, owner, status, low stock, and availability
- Cursor-based pagination
- Immutable per-item history showing who did what, when, and the before and after values

**Consumables**
- Use and restock with exact before and after balances
- Stock can never go negative, even with concurrent requests
- Undo a quantity change
- Low-stock indicators (`quantity <= lowThreshold`)

**Borrowing**
- Full lifecycle: Requested, Reserved, Borrowed, Ready to return, Returned
- Also supports Rejected, Cancelled, and Lost or damaged, with required notes
- Several people can request an item at once. The first approval wins and the rest are rejected with history.
- Items can be marked lost or damaged and later restored
- Return dates default to 7 days after handover

**Reminders and notifications**
- In-app reminders for loans that are due soon or overdue
- Expo push notifications for new requests, low stock, confirmed returns, returns due tomorrow, and overdue loans
- Reminder times respect each borrower's stored time zone
- In-app notifications still work if push permission is denied

**Design and accessibility**
- Light and dark themes, plus a system option
- Palette of smoked rose, deep fig plum, and hearth gold
- WCAG contrast ratios documented in [`docs/contrast-check.md`](docs/contrast-check.md)
- Status is always shown as text plus an icon, never color alone
- Reduced-motion friendly with minimal animation

## How it works

```
┌──────────────────┐   Supabase Auth     ┌────────────────────┐
│  Expo mobile app │ ──────────────────► │  Supabase Auth     │
│  (iOS/Android/   │ ◄── access token ── │  (asymmetric JWTs) │
│   web)           │                     └────────────────────┘
│                  │   Bearer token + Idempotency-Key
│                  │ ──────────────────► ┌────────────────────┐   Prisma    ┌──────────────┐
│                  │ ◄────── JSON ────── │  Express API /v1   │ ──────────► │  PostgreSQL  │
└──────────────────┘                     │  (JWKS verify,     │             │  (RLS, CHECKs│
        │                                │   policy checks)   │             │   triggers)  │
        │ signed upload token            └─────────┬──────────┘             └──────────────┘
        ▼                                          │ reminder worker (1 min)
┌──────────────────┐                               ▼
│ Supabase Storage │                      ┌────────────────────┐
│ (private bucket) │                      │  Expo Push Service │
└──────────────────┘                      └────────────────────┘
```

The mobile app never queries application tables directly. It signs in with Supabase Auth and sends the access token to the Express API. The API verifies the token against the project's JWKS, uses the token's `sub` as the user ID, and runs all authorization itself.

## Quick start

### Prerequisites

- Node.js **20.19.4 or newer** and npm
- Python 3 (only for the one-command runner)
- A [Supabase](https://supabase.com) project
- [Expo Go](https://expo.dev/go) on your phone, or an iOS simulator or Android emulator

### 1. Configure Supabase

1. Create a Supabase project and enable **asymmetric JWT signing keys**. The server verifies tokens through the project's JWKS. A project still on legacy HS256 will return `401`.
2. Under **Authentication → URL Configuration**, add these redirect URLs:
   - `exp://**` for Expo Go
   - `http://localhost:19006/**` (or your Expo web origin) for web
   - `hestia://**` for a development build

   The API address (`http://localhost:3000`) must **not** be the Site URL.
3. Under **Authentication → Email Templates → Confirm signup**, make sure the link uses `{{ .ConfirmationURL }}`.

### 2. Environment files

```bash
cp server/.env.example server/.env
cp mobile/.env.example mobile/.env
```

**`server/.env`**

| Variable | Description |
| --- | --- |
| `PORT` | API port (default `3000`) |
| `NODE_ENV` | `development`, `test`, or `production` |
| `DATABASE_URL` | Runtime Postgres URL. Use the direct IPv6 endpoint, or the session pooler if your host has no IPv6. |
| `DIRECT_URL` | Direct Postgres URL, used for migrations |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_SECRET_KEY` | Server-only `sb_secret_...` key |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `TRUST_PROXY_HOPS` | Number of reverse proxies in front of the API (0 to 3) |
| `PHOTO_BUCKET` | Must be `item-photos` |

**`mobile/.env`**

| Variable | Description |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (`sb_publishable_...`) |
| `EXPO_PUBLIC_API_BASE_URL` | `http://localhost:3000`, or `http://<your-LAN-IP>:3000` for a physical phone |

> **Never put the Supabase secret key in `mobile/.env`.** Anything prefixed `EXPO_PUBLIC_` ships inside the app bundle.

### 3. Run everything with one command

```bash
python3 run_hestia.py --setup   # first run, or after migrations change
python3 run_hestia.py           # every run after that
```

The runner:
- Validates `server/.env` and `mobile/.env`
- Detects your machine's current LAN IP and updates `EXPO_PUBLIC_API_BASE_URL` when it changes
- Installs dependencies, generates the Prisma client, deploys migrations, and builds the server (with `--setup`)
- Starts the API, waits for `/health`, then starts Expo

Scan the QR code with Expo Go and keep the terminal open. If IP detection fails, pass `--ip YOUR_LAN_IP`.

If the database step fails, `python3 check_database.py` tests the Postgres login without printing credentials.

### Manual setup

```bash
# API
cd server
npm ci
npm run prisma:generate
npm run db:migrate      # prisma migrate deploy
npm run dev             # http://localhost:3000

# Mobile (in another terminal)
cd mobile
npm ci
npm start               # add --clear after changing .env
```

Check the API at `http://<host>:3000/health` (process is up) and `http://<host>:3000/ready` (database is reachable).

## Project structure

```
Hestia/
├── run_hestia.py            # One-command local runner
├── check_database.py        # Postgres login diagnostics
├── docs/                    # Plan, backend contract, setup guides, contrast report
├── mobile/                  # Expo app
│   ├── src/app/             # Expo Router screens and root layout
│   ├── src/components/      # Auth, home, items, borrowing, Space, profile UI
│   ├── src/api/             # Typed API client and adapters
│   ├── src/lib/             # Supabase client, push registration
│   ├── src/theme/           # Colors, spacing, type scale, status metadata
│   └── src/types.ts         # Shared client types
└── server/                  # Express API
    ├── prisma/              # schema.prisma and SQL migrations
    ├── src/routes/          # spaces, items, borrowing, photos, reminders
    ├── src/auth.ts          # Supabase JWKS verification
    ├── src/policy.ts        # Membership, visibility, keeper checks
    ├── src/idempotency.ts   # Mutation receipts
    ├── src/reminders.ts     # Push and reminder worker
    └── test/                # Vitest and Supertest suites
```

## Borrowing workflow

| From | Action | Who | To |
| --- | --- | --- | --- |
| Available | Request | Space member (not the owner or custodian) | Requested |
| Requested | Approve | Owner or custodian | Reserved |
| Requested | Reject | Owner or custodian | Rejected |
| Requested | Cancel | Borrower | Cancelled |
| Reserved | Hand over | Owner or custodian | Borrowed |
| Borrowed | Mark ready | Borrower | Ready to return |
| Ready to return | Confirm receipt | Owner or custodian | Returned |
| Borrowed or Ready to return | Report lost or damaged (note required) | Owner or custodian | Lost or damaged |

- An item is **unavailable** only while a request is `Reserved`, `Borrowed`, or `Ready to return`. A pending request alone does not block others.
- A partial unique index in PostgreSQL guarantees at most one active loan per item, even under race conditions.
- **Overdue** is a display state. It does not change the loan or grant admins extra authority.

## Permissions

| Action | Admin | Member | Owner | Custodian | Borrower |
| --- | :---: | :---: | :---: | :---: | :---: |
| View shared item | ✅ | ✅ | ✅ | ✅ | ✅ |
| View private item | owner only | owner only | ✅ | ❌ | ❌ |
| Manage members, invites, roles | ✅ | ❌ | ❌ | ❌ | ❌ |
| Assign custodian or transfer ownership | ✅ | ❌ | ❌ | ❌ | ❌ |
| Edit shared item | ✅ | ❌ | ✅ | ✅ | ❌ |
| Use or restock shared consumable | ✅ | ✅ | ✅ | ✅ | ✅ |
| Approve, reject, hand over, receive, report | keepers only | keepers only | ✅ | ✅ | ❌ |
| Cancel pending or mark ready | borrower only | borrower only | ❌ | ❌ | ✅ |

**Admin status alone never reveals a private item or grants keeper powers.** Inaccessible objects return `404`, so their existence is not leaked.

## API

All `/v1` routes require `Authorization: Bearer <Supabase access token>`. Every mutation requires a unique `Idempotency-Key`. Retrying with the same key and body replays the stored result, and reusing a key with different input returns `IDEMPOTENCY_REUSED`.

```bash
curl -sS http://localhost:3000/v1/spaces \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"name":"Home"}'
```

**Main endpoints**

| Area | Endpoints |
| --- | --- |
| Session and profile | `GET/PATCH /v1/session`, `PATCH /v1/profile` |
| Spaces | `GET/POST /v1/spaces`, `GET/DELETE /v1/spaces/:id`, `POST /v1/spaces/join`, `POST /v1/spaces/:id/leave` |
| Members and invites | `/v1/spaces/:id/members`, `/v1/spaces/:id/invites`, `.../invites/:inviteId/revoke` |
| Items | `GET/POST /v1/spaces/:id/items`, `GET/PUT/DELETE /v1/items/:id`, `PATCH .../custodian`, `PATCH .../owner` |
| Stock | `POST /v1/items/:id/use`, `/restock`, `/quantity-undo` |
| Borrowing | `POST /v1/items/:id/requests`, `GET /v1/requests`, `POST /v1/requests/:id/{approve,reject,cancel,handover,ready,return,lost-or-damaged}` |
| Condition | `POST /v1/items/:id/report-issue`, `/restore` |
| Photos | `POST /v1/items/:id/photo-uploads`, `.../complete`, `GET /v1/items/:id/photo` |
| History and reminders | `GET /v1/items/:id/history`, `GET /v1/reminders`, `GET /v1/notifications` |
| Devices | `PUT/DELETE /v1/devices/:id` |

Lists return `{ data: T[], nextCursor: string | null }` with `cursor` and `limit` (1 to 100) parameters.

**Errors** follow `{ code, message, fieldErrors? }`:

| Status | Code | Meaning |
| --- | --- | --- |
| 401 | `AUTH_REQUIRED` | Missing or invalid session |
| 403 | `FORBIDDEN` | Accessible object, insufficient authority |
| 404 | `NOT_FOUND` | Missing, or not visible to you |
| 409 | `CONFLICT` | Stale state or quantity conflict |
| 409 | `IDEMPOTENCY_REUSED` | Key reused with different input |
| 400/413/422 | `VALIDATION` | Invalid input |
| 429 | `RATE_LIMITED` | Back off |
| 503 | `TEMPORARY` | Retry with the same idempotency key |

The full contract and a request-by-request walkthrough are in [`docs/backend.md`](docs/backend.md).

## Data integrity and security

Application logic is backed by database-level guarantees:

- **Row locking:** the API locks the item row before borrowing and stock transitions, so two simultaneous approvals produce one winner and one `409`.
- **Partial unique index:** only one `Reserved`, `Borrowed`, or `Ready to return` request per item.
- **CHECK constraints:** no negative stock, no stock fields on returnables, valid private-item custodian rules, and complete before and after pairs.
- **Triggers:** membership checks, valid state transitions, mandatory stock event insertion, and append-only history and audit tables.
- **Row-level security** is enabled on every application table with no client policies. Direct Data API access with anon or authenticated keys is blocked.
- **JWT verification:** signature, expiry, issuer, `aud=authenticated`, and `role=authenticated` on every request.
- **Private photo bucket:** 5 MB limit, JPEG/PNG/WebP only. Magic bytes are verified server-side. Download URLs expire after 60 seconds.
- **Hardening:** Helmet, restricted CORS, strict Zod request schemas, a 64 KB JSON limit, rate limits (120 requests per minute on `/v1`, 5 per minute on invite joins), and startup environment validation.

The backend doc maps these controls to the OWASP API Security Top 10 (2023).

## Reminders and push notifications

- The API process runs the reminder worker every minute. It can also be run once with `npm run reminders` from a trusted scheduler.
- An upcoming-return reminder is created once within 24 hours of the due time. Overdue reminders repeat each local day after 09:00 in the borrower's time zone.
- Events are de-duplicated per request, kind, day, and device. Workers atomically claim pending events.
- Expo push tickets and receipts are tracked, and tokens reported `DeviceNotRegistered` are disabled.
- Failed sends stay `failed` for operator review. They are not retried automatically, because Expo may have accepted the push before a network error.
- To test remote push, use a **development build** (Expo Go is not reliable for this) and set `EXPO_PUBLIC_EAS_PROJECT_ID` or `extra.eas.projectId`.

## Testing and quality

```bash
# Server
cd server
npm run build
npm test

# Mobile
cd mobile
npm run lint
npm run typecheck
npm run check:supabase   # verifies your Supabase env settings
```

Some server tests (concurrent approvals, last-unit usage races, private-item permissions, idempotency, Space switching) need a **disposable, migrated PostgreSQL database**. They skip unless `TEST_DATABASE_URL` is set. Do not point them at production. Tests create unique rows and history is append-only.

## Design

| Token | Light | Dark |
| --- | --- | --- |
| Background | `#F3E8E2` (smoked rose) | `#3F2B42` (deep fig plum) |
| Text | `#3F2B42` | `#F3E8E2` |
| Accent | `#D8942F` (hearth gold) | `#D8942F` |

Gold on smoked rose has a contrast ratio of only 2.13:1, so gold is used only as a filled shape with plum content on top. See [`docs/contrast-check.md`](docs/contrast-check.md) for every pairing.

## Known limitations

- Photo uploads that never complete can leave orphaned objects in storage. Schedule a cleanup after the two-hour token lifetime.
- Signed photo URLs cannot be revoked during their 60-second life.
- The inventory screen loads all item pages. Very large Spaces would benefit from incremental pagination.
- Quantities are whole integers. Fractional stock would need a decimal-string contract and a migration to `numeric(12,3)`.
- Physical-device QA (VoiceOver, TalkBack, Dynamic Type, dark mode, push) still needs to be done.
- The Prisma 6 CLI tooling has dependency advisories to reassess when upgrading to Prisma 7.

## Documentation

- [Product and engineering plan](docs/hestia-plan.md)
- [Backend contract and runbook](docs/backend.md)
- [Supabase and phone setup](docs/supabase-connection.md)
- [Mobile app guide](mobile/README.md)
- [Color contrast report](docs/contrast-check.md)
- [Milestone 1: foundation](docs/milestone-01-foundation.md)

## Contributing

Issues and pull requests are welcome. Before opening a PR, run `npm run lint` and `npm run typecheck` in `mobile/`, and `npm run build` and `npm test` in `server/`. For database changes, add a new Prisma migration. Do not edit existing ones.

## License

Add a license for the project here. The `mobile/` folder currently includes the MIT license from the Expo template.
