# Hestia implementation notes

## Audit

1. Kept the existing Expo Router, React Native, TypeScript, and safe-area shell.
2. Kept the HTTP client and Supabase scaffolding as future integration references; the running app uses local mock data.
3. Replaced the single inventory preview with onboarding, six tab destinations, item detail, forms, requests, and Space management.
4. Replaced the old green preview palette with the fixed smoked rose, deep fig plum, and hearth gold tokens.
5. Kept the existing project and app identity; `app.json` already said Hestia, and its remaining splash and Android background colors now match the palette.

## Mock API functions

`getSession`, `listItems`, `getItem`, `listMembers`, `getSpace`, `signIn`, `signOut`, `createSpace`, `joinSpace`, `switchSpace`, `updateSettings`, `addItem`, `updateItem`, `assignCustodian`, `removeMember`, `recordUsage`, `restockItem`, `undoQuantity`, `requestBorrow`, `approveRequest`, `rejectRequest`, `cancelRequest`, `handOver`, `readyToReturn`, `confirmReturn`, `reportLostOrDamaged`, `setStressMode`, `simulateNextFailure`, `simulateNextConflict`.

All returned data is typed by `src/types.ts`. Writes are serialized, persisted in AsyncStorage, delayed by 180–500 ms, and occasionally fail. The mock enforces membership and visibility, quantity bounds, audit history, permission checks, and valid loan transitions. The request mutation uses an optimistic TanStack Query update and restores the previous cache on conflict.

## Verification

- Typecheck and lint pass.
- Browser preview started with Expo. Tested at 320 px and full browser width.
- Leo requested a returnable, Mira approved and handed it over, Leo marked it ready, and Mira confirmed receipt. Ava as admin could not approve Mira's request without being its custodian.
- Ava assigned Mira as custodian of Leo's power drill.
- Ava recorded usage, undid it, and restocked, with before/after history entries.
- Forced borrow conflict showed an optimistic requested state, then restored available with an error message.
- Worst-case mode rendered 1,000+ items, long and unbroken names, emoji, Thai text, missing photos, zero stock, and a large quantity. Cards kept actions reachable at 320 px; full names remain available on detail.

## Motion review

| Finding | Decision |
| --- | --- |
| Frequent tab changes | No custom animation. |
| Press feedback | 0.97 scale, 100 ms press, 150 ms spring release on the UI runtime. |
| Sheets | Native modal slide; no movement with reduced motion. Static blur on iOS/web, solid scrim fallback on Android. |
| Haptics | One success or error notification after mutations, with visible feedback as well. |

Verdict: no layout-property animation, hover effect, long UI duration, or unbounded animation. Native device feel and accessibility still require device QA.

## Known gaps

The sign-in is a demo user switcher rather than real authentication. Invites are local to the demo database. Notification delivery, remote photo storage, and multi-device synchronization await the backend. Physical iOS and Android QA remains necessary. Photo picker URIs may be evicted by the OS cache; persistent uploads should replace them with the backend.
