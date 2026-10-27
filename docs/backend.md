# Hestia backend contract and runbook

## Requirements and layout

The Express API is the sole client of application tables. Supabase Auth issues access tokens; the API verifies each token and uses its `sub` as the app user ID. Supabase Storage holds private item photos. PostgreSQL keeps inventory, memberships, requests, append-only history, audit records, idempotency receipts, and reminders.

```
server/
  prisma/schema.prisma                 Prisma data model
  prisma/migrations/202610250001_*    generated model migration
  prisma/migrations/202610250002_*    PostgreSQL-only invariants
  src/app.ts                           HTTP middleware and routing
  src/auth.ts                          Supabase JWT verification
  src/policy.ts                        membership and item visibility
  src/routes/                         resources and state transitions
  src/reminders.ts                     scheduled Expo delivery worker
  src/contract.ts                      Zod request contract
  test/api.test.ts                     Supertest and concurrency tests
```

Private items retain a `spaceId` because that is the existing mobile contract, but only their owner can read them; the owner must remain a Space member. This differs from the older product plan's private-without-Space proposal. The schema uses `Item.quantity` as an integer because the current mobile mock uses whole-unit JavaScript numbers. PostgreSQL `CHECK` rejects negative quantities and stock fields on returnables. Low stock means `quantity <= lowThreshold`. A future fractional stock feature should change the client contract to decimal strings and migrate to `numeric(12,3)` so JavaScript floating point rounding never becomes a ledger value.

Every timestamp uses PostgreSQL `timestamptz(3)`, which stores an absolute instant. The API returns UTC ISO strings; the app formats them in the user's time zone. Reminder daily deduplication uses the borrower's stored IANA time zone.

## State machine and authority

| From | Action | Actor | To |
| --- | --- | --- | --- |
| Available | request | Space member except owner/custodian | Requested |
| Requested | approve | owner/custodian | Reserved |
| Requested | reject | owner/custodian | Rejected |
| Requested | cancel | borrower | Cancelled |
| Reserved | handover | owner/custodian | Borrowed |
| Borrowed | ready | borrower | Ready to return |
| Ready to return | receipt | owner/custodian | Returned |
| Borrowed, Ready to return | report with note | owner/custodian | Lost or damaged |

`POST /v1/items/:itemId/report-issue` marks an unborrowed returnable lost/damaged with a note. `POST /v1/items/:itemId/restore` clears that condition with a note and keeps the terminal request and history. Overdue does not change state or give an admin extra authority. Several requests may be `Requested`; approving one rejects the others with history. The partial unique index allows only one `Reserved`, `Borrowed`, or `Ready to return` request per item. The API locks the item row before transitions, then records events and the response in one transaction. A borrower cannot approve their own request. The due date defaults to seven days after handover unless a future date was supplied when requesting.

| Action | Admin | Member | Owner | Custodian | Borrower |
| --- | --- | --- | --- | --- | --- |
| View shared item | yes | yes | yes | yes | yes |
| View private item | only if owner | only if owner | yes | no | no |
| Manage members/invites/roles | yes | no | no | no | no |
| Assign custodian/transfer shared ownership | yes | no | no | no | no |
| Edit shared item | yes | no | yes | yes | no |
| Use/restock shared consumable | yes | yes | yes | yes | yes |
| Request shared returnable | yes, if not keeper | yes, if not keeper | no | no | yes |
| Approve/reject/handover/receive/report | only if owner/custodian | only if owner/custodian | yes | yes | no |
| Cancel pending/mark ready | only if borrower | only if borrower | no | no | yes |

Admin status alone never grants access to a private item or keeper actions. Item reads use the same private/shared scope for detail, list, search, history, and photo signing. Inaccessible IDs return 404. A departing or removed member must settle active loans and transfer or archive owned items. Pending requests are cancelled with history. The last admin must promote another admin before leaving. A removed custodian is cleared with an event.

## Database choices

The first migration is generated from Prisma's data model. The second migration contains features Prisma schema cannot express:

1. Partial unique index on active borrow states, the final guard against double reservation.
2. Cross-column `CHECK` constraints for stock shape, nonnegative values, private custodian exclusion, complete before/after pairs, and invite usage bounds.
3. Triggers for membership checks, valid borrowing state changes, mandatory stock event insertion, and append-only activity/audit tables.
4. RLS enabled with no client policies on every application table. The server's privileged Postgres role bypasses this RLS, so Express policy checks remain the primary protection. RLS blocks accidental direct Data API access using an anon or authenticated key. Since the app uses only Prisma for these tables, disabling the Supabase Data API in project settings is an additional deployment defense.
5. A private Storage bucket with a 5 MB limit and JPEG/PNG/WebP allowlist, if the Supabase `storage` schema is present.

The stock trigger reads the actor and event kind from transaction-local PostgreSQL settings set by the API. Transaction-local settings are safe through transaction pooling because they disappear at commit. The trigger and quantity update share a transaction; if the event cannot be written, stock cannot change. The API locks the item row for a precise before/after value.

For Prisma ORM 6, `DATABASE_URL` is the runtime URL and `DIRECT_URL` is the migration URL in `schema.prisma`. Copy the actual host and username from **Supabase Dashboard → Connect**. For a persistent API host with IPv6, use `postgres@db.[PROJECT_REF].supabase.co:5432` for both URLs. Keep `?sslmode=require&connection_limit=5&connect_timeout=5&pool_timeout=8` on the runtime URL so an unreachable database returns an API error before the phone's request timeout. The five-connection cap is per API process; size it to the Supabase plan and replica count. Percent-encode reserved password characters. If the API host cannot reach IPv6, use the session pooler on port 5432 for `DATABASE_URL`, while keeping `DIRECT_URL` on the direct endpoint for migrations. Migrations need a direct connection because they use session-level PostgreSQL behavior. Do not run migrations through the transaction pooler on port 6543.

Supabase Auth must use **asymmetric signing keys** (RS256 or ES256) for local JWKS verification. The API verifies signature, expiry, issuer `${SUPABASE_URL}/auth/v1`, `aud=authenticated`, and `role=authenticated`. A project still using legacy HS256 will return 401 until migrated to asymmetric keys. No shared JWT secret or service key goes in the mobile app.

## API

All `/v1` routes require `Authorization: Bearer <Supabase access token>`. Every mutation requires a unique `Idempotency-Key` for one intended operation; a retry uses the same key and body. Reusing a key for different input returns `IDEMPOTENCY_REUSED`. Mutations return the updated resource (or the updated session for Space/session actions). JSON errors are `{code,message,fieldErrors?}`. All timestamps are ISO 8601 UTC strings and IDs are UUIDs. List responses are `{data: T[], nextCursor: string | null}`; pass `cursor` and `limit` (1–100).

| Method | Path | Body → response |
| --- | --- | --- |
| GET/PATCH | `/v1/session` | session / `{spaceId?,theme?,notifications?,timeZone?}` → Session |
| PATCH | `/v1/profile` | `{name,timeZone}` → profile |
| GET/POST | `/v1/spaces` | page / `{name}` → Session on create |
| GET | `/v1/spaces/:spaceId` | Space `{id,name,code:"",memberIds,adminIds}` |
| DELETE | `/v1/spaces/:spaceId` | `{confirmName}` → archive Space and preserve history |
| GET | `/v1/spaces/:spaceId/members` | member page |
| PATCH/DELETE | `/v1/spaces/:spaceId/members/:memberId` | `{role}` → Member / Session |
| POST | `/v1/spaces/:spaceId/leave` | `{}` → Session |
| GET/POST | `/v1/spaces/:spaceId/invites` | invite page / `{}` → eight-character code valid for seven days |
| POST | `/v1/spaces/:spaceId/invites/:inviteId/revoke` | `{}` → revoked invite |
| POST | `/v1/spaces/join` | `{code}` → Session |
| GET/POST | `/v1/spaces/:spaceId/items` | filtered page / ItemInput → Item |
| GET/PUT/DELETE | `/v1/items/:itemId` | Item / ItemInput → Item / archived ID |
| PATCH | `/v1/items/:itemId/custodian` | `{memberId: UUID|null}` → Item |
| PATCH | `/v1/items/:itemId/owner` | `{memberId}` → Item |
| GET | `/v1/items/:itemId/history` | activity page |
| POST | `/v1/items/:itemId/use`, `/restock` | `{amount: positive integer}` → Item |
| POST | `/v1/items/:itemId/quantity-undo` | `{activityId}` → Item |
| POST | `/v1/items/:itemId/requests` | `{dueAt?: ISO UTC}` → Item |
| GET | `/v1/requests?direction=incoming|outgoing&itemId=UUID&status=Requested` | request page |
| POST | `/v1/requests/:requestId/{approve,reject,cancel,handover,ready,return}` | `{}` → Item |
| POST | `/v1/requests/:requestId/lost-or-damaged` | `{note}` → Item |
| POST | `/v1/items/:itemId/restore` | `{note}` → Item |
| POST | `/v1/items/:itemId/report-issue` | `{note}` → Item |
| POST | `/v1/items/:itemId/photo-uploads` | `{mime,size}` → `{id,path,token,signedUrl,expiresAt,maxBytes}` |
| POST | `/v1/items/:itemId/photo-uploads/:uploadId/complete` | `{}` → Item |
| GET | `/v1/items/:itemId/photo` | `{url,expiresIn}`; URL lasts 60 seconds |
| PUT/DELETE | `/v1/devices/:tokenId` | `{token,platform}` → device / disabled device |
| GET | `/v1/reminders` | due/overdue loan page |
| GET | `/v1/notifications?spaceId=UUID` | saved event notification page |
| POST | `/v1/notifications/:notificationId/read` | `{}` → read receipt |

Item filters: `q`, `category`, `location`, `kind`, `visibility`, `ownerId`, `status` (`Available`, `Requested`, `Reserved`, `Borrowed`, `Ready to return`, `Lost or damaged`), `lowStock=true|false`, `availability=available|unavailable`. `q` searches name, category, and location. 404 hides inaccessible objects; 403 means an accessible object but insufficient action authority; 409 is stale state or quantity conflict; 422 is invalid input; 429 is rate limiting; 503 is transient failure.

| Status | Typed code | Client action |
| --- | --- | --- |
| 401 | `AUTH_REQUIRED` | Refresh Auth session or sign in |
| 403 | `FORBIDDEN` | Hide action and refetch permissions |
| 404 | `NOT_FOUND` | Remove inaccessible resource from cache |
| 409 | `CONFLICT` | Roll back optimistic update and refetch |
| 409 | `IDEMPOTENCY_REUSED` | Generate a key for the new operation |
| 400/413/422 | `VALIDATION` | Show input/body error |
| 429 | `RATE_LIMITED` | Back off |
| 503 | `TEMPORARY` | Retry same operation with same idempotency key |

## Mobile contract changes

The current mock cannot be swapped byte-for-byte because it contains **demo identity**, a persistent six-character Space code, local `photoUri`, one loan slot, and unpaginated arrays. Its production API adapter should preserve the exported function names but make these changes:

- `signIn(userId)` and `signOut()` become Supabase Auth sign-in/sign-out. Remove the demo user selector; `getSession()` reads the authenticated profile and selected Space. Store/refresh the Auth session in device storage before calling the API.
- `getSpace().code` is always empty. Admins call `POST /spaces/:id/invites` to create a seven-day code and show that one-time value. The app keeps the issued code on the admin's device and checks its server status before displaying it. `joinSpace(code)` calls `/spaces/join`.
- `listItems()` and `listMembers()` unwrap `data` and handle `nextCursor` with TanStack Query infinite queries, or fetch all pages in the adapter temporarily. `getItem()` is needed when opening detail because paginated list items are not a complete cache.
- Borrowing actions must pass the specific `loan.id` to `/requests/:requestId/...`. Several pending requests are valid; the item view shows the actor's actionable request or the active loan. A dedicated `/requests` inbox presents all pending requests to keepers.
- The current screen's `active()` treats `Requested` as unavailable. Change availability to only `Reserved`, `Borrowed`, or `Ready to return`; show a pending request to its borrower while letting other members submit their own request. The current Requests tab must use the paginated `/requests` inbox to show every pending request.
- `ItemInput.photoUri` is unsafe as a persisted device URI. Ask for a signed upload, upload to Supabase Storage with the returned token, complete the upload, then read a fresh short-lived photo URL. Keep `photoUri` as a view-only signed URL if desired; refresh it when expired.
- Item responses add `damaged: boolean` so the app can show an unavailable condition even when an item was lost outside a loan.
- The screen's `itemStatus()` must check `damaged` before showing `Available` for a returnable.
- `setStressMode`, `simulateNextFailure`, and `simulateNextConflict` remain local development tools and have no production endpoint.

Suggested TanStack Query keys: `['session']`, `['spaces']`, `['space',spaceId]`, `['members',spaceId]`, `['invites',spaceId]`, `['items',spaceId,filters]`, `['item',itemId]`, `['history',itemId]`, `['requests',spaceId,direction]`, `['reminders']`. Space/membership/invite mutations invalidate session, spaces, members, invites. Item metadata/photo/stock mutations invalidate items, item, history. Borrowing mutations invalidate items, item, history, requests, reminders. Settings/device mutations invalidate session or reminders as applicable. On `CONFLICT`, restore optimistic data and refetch the item/request.

## Reminders and photos

Run `npm run reminders` every 15 minutes from a trusted scheduler. The worker creates a unique upcoming event once within 24 hours of due time and an overdue event each local calendar day after 09:00 in the borrower's stored IANA time zone. Each event is unique per request, kind, day, and device; workers atomically claim pending events. Disabled user notifications or disabled device tokens suppress sends. The worker stores Expo push ticket IDs, checks receipts after 15 minutes, and disables tokens reported `DeviceNotRegistered`. `/v1/reminders` provides an in-app list even without push permission. Send failures stay `failed` for operator review; the worker does not automatically retry uncertain sends because Expo may have accepted them before a network failure.

Photo signing checks item visibility and keeper authority. Upload paths are random under the item ID and the bucket is private. The server checks Storage's reported content type and size, then reads the uploaded bytes to verify JPEG/PNG/WebP signatures before attaching a photo. The bucket enforces its own limits. A signed URL remains usable for its 60-second life after membership changes; keep this TTL short.

## Security checklist

| OWASP API risk | Hestia control |
| --- | --- |
| API1 Broken object-level authorization | Central member/visibility/keeper checks; 404 for inaccessible items, requests, history, photos; integration tests |
| API2 Broken authentication | JWKS signature, issuer, audience, expiry, role validation on every `/v1` request; no user IDs trusted from body |
| API3 Broken object property authorization | Strict Zod bodies; owner, stock, kind, photo path, and roles are not mass assignable |
| API4 Resource consumption | Pagination cap, 64 KB JSON limit, rate limits, 5 MB photo limit; cap history embedded in Item |
| API5 Broken function-level authorization | Admin and keeper policies checked in mutation transactions; audit role/approval/removal |
| API6 Sensitive business flow abuse | Invite token entropy, expiry, use cap, revoke, join rate limit; idempotency receipts |
| API7 SSRF | No user-supplied URL fetch; photo paths are server generated; Expo endpoint fixed |
| API8 Security misconfiguration | Startup env validation, Helmet, restricted CORS, private bucket, deny-by-default RLS, secrets ignored by Git |
| API9 Improper inventory management | Single versioned `/v1` router and endpoint table; no public debug routes |
| API10 Unsafe API consumption | Expo tickets and receipts checked; Storage metadata checked; upstream errors are not returned to clients |

The list follows the [OWASP API Security Top 10 (2023)](https://api-security.owasp.org/editions/2023/en/0x11-t10/).

## Current verification and remaining work

`npm run build`, Prisma client generation/schema validation, and the three database-free Supertest checks pass. The four PostgreSQL integration cases (concurrent approvals, concurrent last-unit usage, private-item/keeper permissions, and idempotency) are present but skip until `TEST_DATABASE_URL` points to a disposable migrated PostgreSQL database. No migration has been run against a Supabase project because this workspace has no server database credentials. The custom SQL migration therefore still needs live execution and inspection.

The reminder worker needs a trusted 15-minute scheduler in deployment. Failed or uncertain Expo sends remain marked `failed` for review; automatic retry could duplicate a push that Expo already accepted. Short-lived photo upload tokens may leave orphan objects if an upload never completes; schedule an orphan cleanup after the two-hour token lifetime. Signed download URLs cannot be revoked during their 60-second lifetime. Mobile Auth, paginated API reads, and signed photo uploads are implemented. Push device registration and an in-app reminder view remain frontend work; the inventory screen currently loads all item pages and should switch to incremental pagination for very large Spaces.

Vitest was updated to 5.0.5, removing the critical test-tool advisories. The remaining dependency audit reports four high advisories through Prisma 6's CLI configuration dependencies (`@prisma/config`, `deepmerge-ts`, and `effect`). Those packages run in migration/build tooling rather than an API route, but they should be reassessed when upgrading to Prisma 7.10.1 or later. This version stays on Prisma 6 so the generated migration and runtime adapter match the verified code path.

## Local setup and verification

1. Create a Supabase project and enable an asymmetric Auth signing key. In **Connect**, obtain the pooled transaction and direct URLs. Fill `server/.env` from `server/.env.example` locally. Keep the secret key only on the server.
2. In `server/`, run `npm ci`, `npm run prisma:generate`, `npm run db:migrate`, `npm run build`, then `npm run dev`. The migration is intentionally **not** run automatically on the user's project.
3. Sign in using Supabase Auth to obtain an access token. Use that token in `Authorization: Bearer ...`. For a create call use `Idempotency-Key: $(uuidgen)` in your shell or an HTTP client generated UUID; reuse that value only to retry the same call.
4. Create a Space with `POST /v1/spaces` body `{"name":"Home"}`. Use the returned `spaceId`. Create a member invite, join with a second account, then create a consumable and a returnable. Use `/use` and `/restock`, request/approve/handover/ready/return, and inspect `/history` and `/reminders`.
5. In Supabase Dashboard, inspect **Database → Tables** for `Item`, `BorrowRequest`, `Activity`, and `Audit`; **SQL Editor** can inspect the partial index and constraints; **Storage** shows the private `item-photos` bucket; **Authentication → Users** shows Auth accounts. Verify that a direct anon Data API call cannot read application tables.
6. For integration tests, provide a disposable `TEST_DATABASE_URL` with both migrations applied and run `npm test`. Tests create unique rows and retain append-only history, so do not point them at production.

HTTP client flow (all IDs and tokens stay in your local client environment):

| Flow | Requests in order | What to inspect |
| --- | --- | --- |
| Space and invite | Auth sign-in → `POST /spaces {"name":"Home"}` → `POST /spaces/:id/invites {}` → second account `POST /spaces/join {"code":"..."}` | `GET /spaces/:id/members`; invite `uses` in Dashboard |
| Consumable | `POST /spaces/:id/items {"name":"Soap","kind":"consumable","category":"Cleaning","location":"Sink","visibility":"shared","quantity":2,"unit":"bottles","lowThreshold":1}` → `POST /items/:id/use {"amount":1}` → `POST /items/:id/restock {"amount":3}` → `GET /items/:id/history` | Balances 2→1→4 and actor IDs in `Activity` |
| Returnable | Create item with `kind:"returnable"` and no stock fields → second account `POST /items/:id/requests {}` → keeper `POST /requests/:requestId/approve {}` → `/handover {}` → borrower `/ready {}` → keeper `/return {}` | State and history at each step; simultaneous approvals yield one 409 |
| Lost/damaged | During Borrowed: keeper `/requests/:requestId/lost-or-damaged {"note":"..."}` → `/items/:id/restore {"note":"..."}` | Old request and notes remain in history |
| Photo | Keeper `POST /items/:id/photo-uploads {"mime":"image/jpeg","size":12345}` → upload bytes with Supabase `uploadToSignedUrl(path,token,file)` → `/complete {}` → member `GET /items/:id/photo` | Bucket is private; inaccessible item returns 404 |
| Reminder | Register device with `PUT /devices/:uuid {"token":"ExpoPushToken[...]","platform":"ios"}` → borrow with a near due date → run worker → `GET /reminders` | `Reminder`, `DeviceToken`, Expo ticket/receipt fields |

Every `POST`, `PUT`, `PATCH`, and `DELETE` request above includes a fresh `Idempotency-Key` header. For example, with a locally stored `TOKEN` variable:

```bash
curl -sS http://localhost:3000/v1/spaces \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Home"}'
```

References: [Supabase JWTs](https://supabase.com/docs/guides/auth/jwts), [Supabase connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres), [Prisma 6 data sources](https://www.prisma.io/docs/orm/v6/prisma-schema/overview/data-sources), [Supabase Storage signed uploads](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl), [Expo push tickets and receipts](https://docs.expo.dev/push-notifications/sending-notifications/), [Expo SDK 58 Notifications](https://docs.expo.dev/versions/v58.0.0/sdk/notifications/).
