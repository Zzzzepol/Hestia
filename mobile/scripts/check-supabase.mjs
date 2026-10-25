const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error('Add the project URL and publishable key to mobile/.env first.');
}
if (!/^https:\/\/[^/]+\/?$/.test(url) || !key.startsWith('sb_publishable_')) {
  throw new Error('Use an HTTPS project URL and an sb_publishable_ key.');
}

const project = url.replace(/\/$/, '');
const response = await fetch(`${project}/auth/v1/health`, {
  headers: { apikey: key },
  signal: AbortSignal.timeout(10_000),
});

if (!response.ok) {
  throw new Error(`Supabase Auth health check failed (HTTP ${response.status}). Check the project URL and key.`);
}

console.log(`Supabase Auth is reachable at ${new URL(project).host}.`);
console.log('This checks Auth reachability only; it does not verify database migrations or the Express API.');
