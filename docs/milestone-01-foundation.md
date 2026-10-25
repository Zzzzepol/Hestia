# Milestone 1 — Expo foundation

Implementation status: foundation code complete; physical iOS/Android accessibility and appearance checks await devices. The app was subsequently moved from SDK 58 to SDK 54 so it can run in the App Store Expo Go on iPhone; see [the connection guide](supabase-connection.md).

## Files

| File | Purpose |
| --- | --- |
| `mobile/app.json`, `mobile/package.json`, `mobile/package-lock.json` | Expo SDK 54, Router, TypeScript, scripts, app identity |
| `mobile/src/app/_layout.tsx` | Native stack, safe area, system light/dark theme |
| `mobile/src/app/index.tsx` | Inventory preview with empty, loading, error, offline, and data states |
| `mobile/src/design/tokens.ts`, `mobile/src/design/use-app-color-scheme.ts` | Type, spacing, light/dark/status/motion tokens and native appearance |
| `mobile/src/dev/inventory-fixtures.ts` | Development-only switch for demo, worst case, empty, one, and 1,000 rows |
| `mobile/src/api/client.ts` | Authenticated `/v1` request shell, idempotency key, timeout, and typed error |
| `mobile/.env.example`, `mobile/README.md`, `README.md` | Local setup and backend environment template |

The first screen uses local fixtures. Authentication, database calls, item actions, and push notifications are not connected yet.

## Code shape

The app starts with Expo Router's root stack and a preview screen. `ItemCard` renders the item name, category, location, photo fallback, and a text status chip. The preview switch is inside `__DEV__`, so the control is absent in production builds. The API client accepts an access-token provider from the upcoming auth milestone:

```ts
const api = createApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL!,
  getAccessToken: async () => session?.access_token ?? null,
});
const page = await api.request<ItemPage>('/v1/items?scope=private');
```

This is an integration example, not code used by the current screen. The server will validate authorization again; a mobile JWT is never treated as permission by itself.

## Setup and verification

1. Install Node.js 20.19.4 or newer (verified here with Node.js 26.3.0).
2. Run `cd mobile && npm install`.
3. Run `npm start`; open in Expo Go or a simulator. No backend variables are needed for the fixture screen.
4. Run `npm run typecheck` and `npm run lint`.
5. When connecting the backend, copy `.env.example` to `.env` and provide only the public Supabase URL/key and API base URL. Keep service secrets on the server.

Original SDK 58 verification: TypeScript and ESLint passed; iOS and Android Metro exports completed. The single-page web preview rendered at 320 px without horizontal overflow or a hydration warning. SDK 54 validation is recorded in the Supabase connection work. Device validation remains required.

## Worst-case review

The development switch includes a long item name, an unbroken identifier, missing photos, a large decimal quantity, zero stock, Thai text, emoji, zero items, one item, and 1,000 items. At 320 px, the longest visible name and status wrapped; document scroll width stayed at 320 px. The 1,000-row fixture rendered a small virtualized window rather than 1,000 cards at once. Empty, loading, error with retry, and offline banner states were visible.

Found and fixed: fixed `lineHeight` values could clip text under larger system font settings, so the preview now lets native text use its natural line height. The fixed-size photo placeholder is decorative; the card's meaningful metadata is in its accessibility label. Physical-device Dynamic Type, VoiceOver, and dark-mode QA are pending.

## Motion review

The screen has immediate pressed-state opacity feedback only; there is no entry or positional animation in this milestone. The planned spring tokens are inert until a motion component uses them. Before that milestone, check reduced motion, interruption, gesture handoff, and frame cost under `review-animations`.

## Skills used

- `apple-design`: `/Users/kinglopez/.agents/skills/apple-design/SKILL.md` — hierarchy, system typography, safe spatial mapping, appearance, and reduced-motion policy. Its web CSS and backdrop-filter instructions are translated in the plan to native system type, Reanimated springs, and optional Expo blur.
- `emil-design-eng`: `/Users/kinglopez/.agents/skills/emil-design-eng/SKILL.md` — compact card hierarchy, restrained status presentation, and immediate press response.
- `mobile-native`: `/Users/kinglopez/.agents/skills/mobile-native/SKILL.md` — only transferable touch-target and safe-area principles.
- `break-ui`: `/Users/kinglopez/.agents/skills/break-ui/SKILL.md` and its `CATALOG.md` — the development fixture switch and 320 px worst-case review.
- `review-animations`: `/Users/kinglopez/.agents/skills/review-animations/SKILL.md` — reviewed this milestone's press feedback and confirmed no positional motion was introduced.

`animate-expo` was not installed. No replacement skill was used. Apple Design's transferable native-motion principles will govern until that skill is available. `pick-ui-library` was not invoked.
