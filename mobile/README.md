# Hestia mobile

Expo 58, React Native, Expo Router, TypeScript, TanStack Query, Supabase Auth, and the Hestia Express API.

## Run

1. Configure and migrate the server using [backend setup](../docs/backend.md#local-setup-and-checks). Start it with `cd server && npm run dev`.
2. Copy `.env.example` to `.env` here. Set the Supabase project URL, publishable key, and API base URL. For a simulator or web on the same Mac, use `http://localhost:3000`; on a physical phone, use `http://<your Mac LAN IP>:3000` while both devices are on the same Wi-Fi network, or a trusted HTTPS tunnel. Never put the Supabase secret key in this file.
3. Run `npm ci` and `npm start`. Restart Expo after changing `.env` with `npm start -- --clear`.
4. In Supabase Dashboard → Authentication → URL Configuration, add `exp://**` to **Redirect URLs** for Expo Go. Add the Expo web origin you open in your browser (for example `http://localhost:19006/**`) for web, and `hestia://**` for a development build. The API address `http://localhost:3000` is not an app URL and must not be the **Site URL**. In Authentication → Email Templates → Confirm signup, the confirmation link should use `{{ .ConfirmationURL }}` so Supabase verifies the email before redirecting. Expo Go links change with the local dev server; a development build provides a stable native URL. Restart Expo after changing `.env`.
5. Register with email and password, open the newest confirmation email, then sign in or continue in the app. If the browser shows the API's `NOT_FOUND` response after opening the link, try signing in first: Supabase may have already confirmed the email before redirecting to the wrong page. If sign-in says the email is not confirmed, enter your email and tap **Resend confirmation email** after fixing the redirect settings. An expired or used link cannot be reused. Supabase may rate limit repeat emails. Then create or join a Space. An admin can generate an expiring invite in the Space tab.

The app no longer reads or seeds local demo inventory. Supabase Auth persists the session in device storage. Every inventory request uses the bearer token and every mutation sends an idempotency key. Photos upload to a private Supabase Storage bucket through a server-issued signed upload token. Item photos are fetched as short-lived signed URLs when the detail view opens.

Check with `npx expo lint` and `npx tsc --noEmit`. [Backend contract](../docs/backend.md) lists the endpoints and error codes.

The Home bell opens reminders backed by current item state and saved notification events. On a physical device with a development build, the app registers an Expo push token after sign-in. Configure an EAS project ID in the build (`extra.eas.projectId` or `EXPO_PUBLIC_EAS_PROJECT_ID`) and the platform push credentials. The API's reminder worker runs every minute and sends new requests, low stock, confirmed returns, returns due tomorrow, and overdue alerts. Return reminder and low-stock preferences control their respective push events. Test remote push with a development build; Expo Go is not a reliable production push test environment. Signing out unregisters this device.
