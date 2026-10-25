# Hestia — first-version product and engineering plan

Status: planning baseline, 25 October 2026. The repository had no app code when this plan was written.

## 1. Product requirements

Hestia is a private inventory for households and small groups. Its core questions are: What do we have? Where is it? Who is using it?

The first version supports email authentication; private and shared items; multiple Spaces with admin/member roles and expiring invite codes or links; photos, categories, locations, owners, custodians, and immutable item history; measured consumable use/restock with low-stock alerts; the full request-to-return borrowing workflow; in-app and push reminders; and scoped search/filtering. It must work accessibly in light/dark mode, larger text, screen readers, reduced motion, and poor connections.

Success criteria: a member can locate an item, record a stock movement, or see who has a returnable without asking the group; no unauthorized member sees a private item or mutates a protected workflow; simultaneous approvals cannot create two active borrowers. Barcode and receipt scanning, expense splitting, public lending, payments, and AI are excluded.

### Decisions that resolve ambiguity

- A private item has no Space and is visible only to its owner. It cannot receive borrowing requests until the owner shares it with a Space.
- An item owner must be a member of the Space that contains a shared item. An admin can assign a custodian who is also a member. If an owner wants to leave, transfer ownership first; removing a custodian requires reassignment if active loans exist.
- A borrower with an active reservation or loan cannot be removed from the Space until the owner/custodian closes that loan. This keeps the borrower able to see the item and mark it ready to return.
- Multiple requests may be pending while the item is Available. The first approval reserves it; other pending requests are automatically rejected with an item-unavailable reason and recorded in history.
- Only the owner/custodian can release a reservation before handover. A borrower can cancel a pending request; after approval, they contact the owner/custodian for release. This prevents a handover from racing with cancellation. A custodian who requests an item cannot approve their own request; the owner must act.
- Lost/damaged is a condition that makes the item unavailable, with an immutable event and note. The owner/custodian may later restore availability with another event. Existing history is never deleted.
- Consumable amounts use decimal strings with at most three fractional places and a fixed per-item unit. Usage cannot make stock negative. Owner/custodian can record a correction with a reason; all members can use/restock shared stock.
- Low stock means `quantity <= low_threshold`, including zero stock and equality at the threshold.
- Return dates are stored as UTC timestamps and displayed in the user's time zone. Upcoming means 24 hours before due; overdue reminders repeat daily until the loan closes. In-app reminders remain available if push permission is denied.

## 2. Screens and navigation

Use Expo Router: authentication group -> Space setup/chooser -> main tabs (Items, Borrowing, Settings). A Space switcher in the header also offers My private items. Item and request details push onto the stack; creation, stock movement, filters, and request composition use sheets. Deep invite links route through authentication before redemption.

| Screen | Main content and actions | Empty / loading / error / offline |
| --- | --- | --- |
| Welcome, sign in, sign up | Email authentication and account recovery | Progress and field errors; offline sign-in explains that a connection is required |
| Space chooser/create/join | Current Spaces, create form, invite redemption | First-Space guidance; skeleton list; retry; cached list marked offline |
| Items | Current Space or private scope, low-stock group, search, kind/category/location/status filters, add | Add-item CTA or no-results reset; skeleton rows; retry; cached read-only list and stale timestamp |
| Add/edit item | Kind, name, photo, category, location, visibility, owner/custodian, unit/threshold if consumable | Draft preserved on interruption; inline validation; retry or queue only safe drafts offline |
| Consumable detail | Quantity, threshold, use/restock action, photo, metadata, history | History placeholder; quantity skeleton; retry; cached value labelled stale and movement disabled offline |
| Stock movement sheet | Use/restock/correction, amount, resulting quantity preview | Inline invalid/insufficient-stock errors; pending-submit state; failed submission retains input |
| Returnable detail | Availability or current borrower, planned due date, request action, photo, history | No-history explanation; skeleton; retry; cached state labelled stale and request action disabled offline |
| Request sheet | Planned return date and optional note | Validation, submitting state, retry without duplicate request; unavailable item notice |
| Borrowing inbox/detail | Incoming requests for owners/custodians; outgoing requests and current loans; approval, handover, ready, receipt, outcome | Empty inbox; skeleton; retry; cached status labelled stale, mutations disabled offline |
| Members/invites | Member roles, custodian assignment, code/link creation/revocation | No invite state; loading; permission error; offline read-only member list |
| Item history | Actor, action, before/after values, notes, timestamps | No events; paginated loading; retry; cached events with last-sync time |
| Settings/reminders | Profile, notification preference, theme/system settings, sign out; due/overdue list | No reminders; loading; retry; cached list marked stale |

Every interactive control needs an accessible role, specific label, and state. Announce borrowing status changes to VoiceOver/TalkBack; show the new status text immediately and never rely on color alone. Respect safe-area insets and keyboard overlap on every sheet.

## 3. Borrowing state machine

Borrowing requests and item condition are separate. Request states: Requested, Reserved, Borrowed, Ready to return, Returned, Rejected, Cancelled, Lost, Damaged. An item is Available when condition is OK and it has no request in Reserved, Borrowed, or Ready to return. Requested alone does not make it unavailable.

| From | Action / actor | To | Item availability |
| --- | --- | --- | --- |
| Available | Submit request / Space member who is not owner | Requested | Still Available |
| Requested | Cancel / requesting borrower | Cancelled | Unchanged |
| Requested | Reject / owner or custodian | Rejected | Unchanged |
| Requested | Approve / owner or custodian | Reserved | Unavailable; competing requests auto-rejected |
| Reserved | Confirm handover / owner or custodian | Borrowed | Unavailable; show borrower |
| Reserved | Release reservation / owner or custodian | Cancelled | Available if condition OK |
| Borrowed | Mark ready / borrower | Ready to return | Unavailable |
| Ready to return | Confirm receipt / owner or custodian | Returned | Available if condition OK |
| Reserved, Borrowed, Ready to return | Record lost/damaged with note / owner or custodian | Lost or Damaged | Unavailable until restored |
| Available | Record lost/damaged with note / owner or custodian | Item condition Lost or Damaged | Unavailable until restored |
| Lost or Damaged | Restore with note / owner or custodian | Item condition OK | Available |

Approval, handover, receipt, outcome, and stock changes are server mutations, never client-only state changes. Every transition inserts an immutable event in the same transaction.

## 4. Backend, schema, and relationships

Use Supabase Auth, PostgreSQL, private Supabase Storage, Postgres functions for atomic mutations, and Edge Functions for the typed HTTP API and notification worker. Postgres gives row locks, constraints, and transactional event writes; RLS protects reads and Storage. The mobile app holds only the publishable key and a user session. A server secret is confined to scheduled jobs. Expo Notifications handles device push, while Postgres Cron invokes the reminder worker. The app uses Expo Router and Reanimated for native navigation and motion.

| Table | Core columns and constraints | Relationship |
| --- | --- | --- |
| profiles | id PK, display_name, time_zone, notification_preferences, created_at | id -> auth.users.id |
| spaces | id PK, name, created_by, created_at, archived_at | created_by -> profiles |
| space_members | space_id, user_id composite PK; role admin/member; joined_at | -> spaces, profiles |
| space_invites | id PK, space_id, token_hash unique, expires_at, max_uses, use_count, created_by, revoked_at | -> spaces, profiles; raw token never stored |
| items | id PK, owner_id, space_id nullable, visibility private/shared, kind consumable/returnable, name, category, location, custodian_id nullable, photo_path nullable, condition OK/lost/damaged, created_at, updated_at, archived_at | -> profiles, spaces; check private iff space_id null |
| consumable_stock | item_id PK, quantity numeric(12,3) >= 0, unit, low_threshold numeric(12,3) >= 0, version | 1:1 -> consumable item |
| borrow_requests | id PK, item_id, borrower_id, planned_return_at, note, status, requested_at, approved_by, approved_at, handed_over_at, ready_at, closed_at | many -> returnable item; borrower/approver -> profiles |
| item_events | id PK, item_id, actor_id, event_type, request_id nullable, quantity_before/after nullable, note/metadata, created_at | append-only -> items and profiles |
| device_tokens | id PK, user_id, expo_token unique, platform, updated_at, revoked_at | -> profiles |
| notification_outbox | id PK, user_id, request_id, kind, scheduled_for, sent_at, delivery_state, dedupe_key unique | -> profiles and borrow_requests |
| mutation_receipts | actor_id, idempotency_key composite PK, operation, response, created_at | safe retry of non-idempotent POSTs |

Constraints: borrow_requests gets a partial unique index on item_id for statuses Reserved, Borrowed, and Ready to return. A row check enforces private iff space_id is null; mutation functions and triggers forbid a stock row for a returnable or borrowing a consumable. The database checks that owners/custodians and borrowers belong to the Space at mutation time. Items and events are soft-retained; no hard delete of an item with history.

For approval, a Postgres function locks the item row with SELECT FOR UPDATE, rechecks actor membership and owner/custodian authority, verifies condition OK and no active request, updates one request, rejects competing pending requests, writes events, and commits. The partial unique index is a second safeguard. Stock movements similarly lock the stock row, compute exact numeric before/after, reject negative balances, and insert the audit event before commit. Use consistent lock order. Direct client UPDATE/DELETE grants on protected tables are revoked; narrowly granted functions validate auth.uid() and all inputs.

Enable RLS and narrow grants on every exposed table. A private item's item/event/photo read requires owner_id = auth.uid(); shared reads require active Space membership. Admin rights never reveal private items. Store photos in a private bucket under item-id paths and authorize downloads through Storage RLS. Never use a public bucket for item photos. Test policies with owner, member, non-member, admin, and unauthenticated identities.

## 5. API contracts and permissions

All /v1 endpoints require a Supabase bearer JWT except sign-in/up handled by Supabase Auth. Edge Functions validate request bodies and UUID/date/decimal formats; Postgres constraints and functions revalidate invariants. Return 401 for no session, 403 for forbidden, 404 for inaccessible item, 409 for stale state/conflict, 422 for invalid input, and 503 for transient backend failure. Every mutation accepts Idempotency-Key; returning the prior result on retry prevents duplicate actions after a poor connection.

Success responses are JSON resources (for example, `POST /v1/requests` returns `{ id, itemId, borrowerId, plannedReturnAt, status: "Requested", requestedAt }`); list responses are `{ data: [...], nextCursor: string | null }`. Errors are `{ code: string, message: string, fieldErrors?: Record<string, string> }`. A 204 response has no body. The client must reuse an Idempotency-Key for retries of one intended mutation, and the server binds the stored receipt to actor, operation, and a request-body hash so a reused key with different input is a conflict.

| Method and path | Input -> output | Permission |
| --- | --- | --- |
| GET /v1/spaces | cursor -> Space summary page | Member sees joined Spaces |
| POST /v1/spaces | name -> Space | Signed-in user becomes admin |
| GET /v1/spaces/:id/members | cursor -> member page | Space member |
| POST /v1/spaces/:id/invites | expiresAt, maxUses -> one-time raw code/link | Space admin |
| POST /v1/invites/redeem | code -> membership | Signed-in user; rate limited; valid unused invite |
| GET /v1/items | scope, query, kind, category, location, status, cursor -> item page | Private owner or Space member through RLS |
| POST /v1/items | kind, visibility, spaceId?, name, category, location, photo?, stock? -> item | Owner; Space membership if shared |
| GET /v1/items/:id | -> item, stock/availability, permissions | Owner or Space member through RLS |
| PATCH /v1/items/:id | editable metadata -> item | Owner/custodian; admin alone may assign custodian |
| POST /v1/items/:id/stock-movements | kind use/restock/correct, decimal amount, reason? -> before/after/event | Shared member for use/restock; owner/custodian for correction |
| POST /v1/items/:id/requests | plannedReturnAt, note? -> Requested request | Space member, not owner; item OK and returnable |
| POST /v1/requests/:id/approve | -> Reserved request | Owner/custodian other than borrower; atomic conflict check |
| POST /v1/requests/:id/reject | reason? -> Rejected | Owner/custodian, Requested only |
| POST /v1/requests/:id/cancel | -> Cancelled | Borrower, Requested only |
| POST /v1/requests/:id/handover | -> Borrowed | Owner/custodian, Reserved only |
| POST /v1/requests/:id/release | reason? -> Cancelled and Available | Owner/custodian, Reserved only |
| POST /v1/requests/:id/ready | -> Ready to return | Borrower, Borrowed only |
| POST /v1/requests/:id/receipt | -> Returned and Available | Owner/custodian, Ready only |
| POST /v1/requests/:id/outcome | lost/damaged, required note -> closed outcome | Owner/custodian, active request only |
| POST /v1/items/:id/condition | lost/damaged/restore, required note -> condition | Owner/custodian |
| GET /v1/items/:id/events | cursor -> immutable event page | Item reader through RLS |
| PUT /v1/me/device-tokens | token, platform -> registered token | Token owner |
| GET /v1/me/reminders | cursor -> reminder page | Recipient only |

Search and filters operate only after access scoping. Use indexed name/category/location lookup and cursor pagination; no client-side fetch of every item. Validate name length (1-120 graphemes), notes (<=1000 characters), quantities (positive decimal string, max 3 places), due date (future), MIME/size for photos, and invite expiry/use count at both API and database boundaries.

## 6. Small milestones

1. Foundation: Expo + TypeScript + Expo Router, project lint/typecheck, theme/accessibility tokens, environment template, API client shell, dev-only state fixture switch. Verify app starts on iOS/Android and the first shell screen survives dark mode and large text.
2. Identity and Spaces: Auth session, profile, create/choose/join Space, invitations, membership RLS and authorization tests. Verify non-members cannot read Space data.
3. Items and search: Private/shared items, category/location, private photos, item list/detail/create/edit, search/filter/pagination. Stress-test long names, missing photos, empty and 1,000-row lists.
4. Consumables: Stock ledger mutations, threshold indicators, low-stock list, audit history. Test concurrent use/restock, nonnegative stock, and exact before/after records.
5. Requests and reservation: Request, reject, cancel, atomic approve, borrowing inbox. Test two simultaneous approvals and stale/offline retries.
6. Handover and return: Borrowed, Ready to return, receipt, lost/damaged, restore, complete history. Test every invalid transition and actor.
7. Reminders and resilience: Device tokens, notification worker/outbox, in-app reminders, offline read cache, retry/idempotency. Test time zones, push denial, duplicates, and due-date changes.
8. Release hardening: Every screen's loading/empty/error/offline state; Dynamic Type, dark mode, VoiceOver/TalkBack, reduced motion; worst-case UI fixture and motion review; device testing and release build.

Each milestone is a vertical slice with migrations, contracts, UI, permission tests, state coverage, and a manual device check. Ship no screen without the four non-happy-path states or accessibility labels.

## 7. Important edge cases and tests

- Security: owner/private visibility, member/non-member read, admin unable to see private item, custodian reassignment, removed member with open loan, tampered JWT, guessed item/photo ID, expired/reused invite, invite brute force.
- Concurrency: simultaneous approvals; approval vs loss; handover vs reservation release; two stock uses against a small balance; duplicate POST after timeout; status changed on another device.
- Data: quantity zero and threshold equality; huge but valid quantity; fractional precision; invalid/changed unit; missing photo; category/location edits; archived item with history; account/Space membership changes.
- Time: due date on daylight-saving change, different user time zones, overdue while offline, changed due date, duplicate cron run, denied push permission, revoked device token.
- UI: zero/one/1,000 items; 120-character names, long unbroken labels, emoji, Thai/Arabic/Vietnamese text, RTL where supported, largest Dynamic Type, small phone, landscape, dark mode, no network during mutation, screen-reader focus after status change.
- Tests: SQL pgTAP policy allow/deny matrix and constraints; database concurrency integration tests with two sessions; API contract/schema tests; React Native screen/component tests; end-to-end happy and failure paths on at least one iOS and one Android device.

## 8. Design system and skill translations

The token values below are Hestia proposals, not numbers supplied by a skill. Test them on real hardware and adjust. Light/dark text and status-chip pairs were checked for at least 4.5:1 contrast by calculation. Every status uses text and an icon in addition to color.

| Token | Values | Rationale |
| --- | --- | --- |
| Type | System font; caption 12, label 14, body 16, title 22, display 30 pt; regular/semibold; generous line height | Apple Design: hierarchy, system font, Dynamic Type. Use native font scaling instead of CSS optical sizing/rem. Emil Design Eng: coherent component hierarchy. |
| Spacing | 4, 8, 12, 16, 24, 32 pt; minimum 44x44 pt touch target | Apple Design: mapping, restraint, direct manipulation. Mobile Native: touch and safe-area principles only. |
| Light | background #F7F8F5, surface #FFFFFF, text #18241E, secondary #4C5E52, primary #176B50, border #CFD9D2 | Apple Design: hierarchy and adapting to appearance; proposed product palette. |
| Dark | background #101713, surface #1D2A22, text #F4F8F4, secondary #BBCBBE, primary #88D5B0, border #3A4A40 | Apple Design: hierarchy and adapting to appearance; proposed product palette. |
| Available | light #176343 on #E6F4EA; dark #9FE2B2 on #153B2B | Status label and check icon; immediate feedback. |
| Requested | light #6250A4 on #F1EDFF; dark #CBBBFF on #30254E | Status label and clock icon. |
| Reserved | light #7A5808 on #FFF2CE; dark #F4D278 on #453409 | Status label and bookmark icon. |
| Borrowed | light #17617D on #E5F4FC; dark #94D8F5 on #193B4B | Status label and person icon. |
| Ready to return | light #794A80 on #FAEAFB; dark #E9AFE8 on #442549 | Status label and return icon. |
| Low stock | light #8F4F00 on #FFF0D8; dark #FFD08A on #4A2C0C | Threshold label and warning icon. |
| Lost/damaged | light #A02D2D on #FBE8E7; dark #FFAAA5 on #4D2326 | Outcome label and warning icon. |
| Returned/rejected/cancelled | light #4C5E52 on #EEF1EE; dark #BBCBBE on #2B3930 | Neutral history label plus action-specific icon. |
| Press motion | Reanimated spring, dampingRatio 1, provisional perceptual duration 120 ms; visible response begins on press-in | Apple Design: immediate feedback, no gratuitous bounce. Native spring replaces CSS :active/cubic-bezier. |
| Sheet/screen motion | Prefer native navigation transition. For a custom sheet, Reanimated spring dampingRatio 1, provisional perceptual duration 300 ms; flick handoff dampingRatio 0.8 only when release has momentum, pass measured velocity | Apple Design: interruptibility, velocity handoff, sheet response around 0.3 s. These are Reanimated tuning values, not an exact conversion of Apple's response parameter. |
| Status motion | Text/icon/state change immediately; optional 120 ms opacity feedback, never delay the server-confirmed status | Apple Design: status feedback and restraint. |
| Reduced motion | Replace positional spring with static layout plus 200 ms opacity crossfade; no bounce; keep status text/announcement | Apple Design: gentler equivalent. Use the system setting through native accessibility/Reanimated, not CSS media queries. |

Native translations: Apple Design's CSS curves and Pointer Events become Reanimated springs/shared values and native gestures; backdrop-filter becomes Expo BlurView only where helpful, with opaque fallback; CSS font features become system fonts and Dynamic Type; CSS reduced-motion queries become the native system setting; mobile-native's browser-specific rules do not apply, but immediate touch feedback and safe-area respect do.

Skill conflict: review-animations asks for CSS ease-out and sub-300 ms UI transitions, while apple-design favors interruptible springs and a 0.3-0.4 s response (which it explicitly says is not a fixed duration). For native gesture motion, apple-design is authoritative as requested; review-animations supplies the purpose, frequency, interruptibility, performance, and accessibility review, without importing CSS curves or treating spring response as elapsed duration. Its objection to pure-fade entrances yields to apple-design's reduced-motion crossfade rule when the user has requested reduced motion.

Skill files used: /Users/kinglopez/.agents/skills/apple-design/SKILL.md; /Users/kinglopez/.agents/skills/emil-design-eng/SKILL.md; /Users/kinglopez/.agents/skills/mobile-native/SKILL.md; /Users/kinglopez/.agents/skills/break-ui/SKILL.md; /Users/kinglopez/.agents/skills/review-animations/SKILL.md. animate-expo was not found in the installed skill directories. animate, animation-performance, and pick-ui-library were read for scope but are not applied to React Native motion or library selection.

Technical references: https://supabase.com/docs/guides/auth/quickstarts/react-native ; https://supabase.com/docs/guides/database/postgres/row-level-security ; https://supabase.com/docs/guides/database/functions ; https://supabase.com/docs/guides/storage/buckets/fundamentals ; https://supabase.com/docs/guides/functions/schedule-functions ; https://www.postgresql.org/docs/current/explicit-locking.html ; https://www.postgresql.org/docs/current/indexes-partial.html ; https://docs.expo.dev/develop/app-navigation/ ; https://docs.expo.dev/versions/latest/sdk/reanimated/ ; https://docs.swmansion.com/react-native-reanimated/docs/animations/withSpring/ ; https://docs.expo.dev/push-notifications/sending-notifications/ .
