# Connect Hestia to Supabase

The Expo app uses Supabase Auth for email registration and sign-in. Its inventory data comes from the Express server, which uses Prisma to query PostgreSQL. The mobile app does not connect to application tables directly.

1. Create a Supabase project and enable asymmetric JWT signing keys. The server verifies access tokens with the project's JWKS.
2. Fill `server/.env` from `server/.env.example` with the direct Postgres URL for this IPv6-capable persistent API, Supabase URL, and server-only secret key. If the API host has no IPv6, use the session pooler for `DATABASE_URL` and keep `DIRECT_URL` direct. Do not paste secrets into chat or put them in `mobile/.env`.
3. From `server/`, run `npm ci`, `npm run prisma:generate`, `npm run db:migrate`, and `npm run dev`. The migrations create the app tables, indexes, constraints, triggers, and private photo bucket.
4. Fill `mobile/.env` from `mobile/.env.example` with the project URL, publishable key, and `EXPO_PUBLIC_API_BASE_URL`. Use the Mac LAN address for a physical phone. In Expo Go development, the app follows Metro's private LAN host when it differs from the configured private IP. Restart Expo and reopen the project after changing networks.
   `http://MAC_LAN_IP:3000/health` checks the API process; `http://MAC_LAN_IP:3000/ready` also checks its PostgreSQL connection.
5. In Supabase Dashboard, inspect **Authentication → Users**, **Database → Tables**, and **Storage → Buckets**. The private `item-photos` bucket should exist after migration.
6. In **Authentication → URL Configuration**, allow `exp://**` for Expo Go, the Expo web origin (for example `http://localhost:19006/**`) for web, and `hestia://**` for a development build. The Express API on port 3000 is not the app and must not be the Site URL. In **Authentication → Email Templates → Confirm signup**, use `{{ .ConfirmationURL }}` for the link. If a link ends at the API's `NOT_FOUND` page, try signing in because confirmation may have succeeded before the redirect. If sign-in reports an unconfirmed email, fix the settings and request a fresh email from the app; an old `otp_expired` link cannot be reused.

If `/health` works but `/ready` returns `DATABASE_UNAVAILABLE`, check outbound TCP access from the API host to the direct or session-pooler PostgreSQL endpoint on port 5432. Supabase Auth and Storage use HTTPS and can work even when the network blocks PostgreSQL traffic. Use another network or run the API on a host that can reach the database; changing the phone's API URL alone will not fix this.

See [backend setup and verification](backend.md#local-setup-and-checks) and [mobile run instructions](../mobile/README.md) for details.
