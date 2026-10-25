# Hestia mobile

Expo 58, React Native, Expo Router, TypeScript, TanStack Query, Supabase Auth, and the Hestia Express API.

## Run

1. Configure and migrate the server using [backend setup](../docs/backend.md#local-setup-and-checks). Start it with `cd server && npm run dev`.
2. Copy `.env.example` to `.env` here. Set the Supabase project URL, publishable key, and API base URL. For a simulator or web on the same Mac, use `http://localhost:3000`; on a physical phone, use `http://<your Mac LAN IP>:3000` while both devices are on the same Wi-Fi network, or a trusted HTTPS tunnel. Never put the Supabase secret key in this file.
3. Run `npm ci` and `npm start`. Restart Expo after changing `.env` with `npm start -- --clear`.
4. In Supabase Dashboard → Authentication → URL Configuration, add the Expo web origin you open in your browser (for example `http://localhost:19006`) and `hestia://**` to **Redirect URLs**. The API address `http://localhost:3000` is not the app URL. Use a development build for reliable native email links; Expo Go links change with the local dev server. Restart Expo after changing `.env`.
5. Register with email and password, open the newest confirmation email, then sign in or continue in the app. If the link expired or was already used, enter your email and tap **Resend confirmation email**. Supabase may rate limit repeat emails. Then create or join a Space. An admin can generate an expiring invite in the Space tab.

The app no longer reads or seeds local demo inventory. Supabase Auth persists the session in device storage. Every inventory request uses the bearer token and every mutation sends an idempotency key. Photos upload to a private Supabase Storage bucket through a server-issued signed upload token. Item photos are fetched as short-lived signed URLs when the detail view opens.

Check with `npx expo lint` and `npx tsc --noEmit`. [Backend contract](../docs/backend.md) lists the endpoints and error codes.

Push device registration is not yet wired in the mobile app; the notification toggle saves the server preference. The server reminder worker and in-app reminder endpoint are available.
