import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().startsWith('postgresql://'),
  DIRECT_URL: z.string().startsWith('postgresql://'),
  SUPABASE_URL: z.url().refine(v => v.startsWith('https://')),
  SUPABASE_SECRET_KEY: z.string().startsWith('sb_secret_').min(20),
  CORS_ORIGINS: z.string().min(1),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(3).default(0),
  PHOTO_BUCKET: z.literal('item-photos').default('item-photos'),
});

export const config = schema.parse(process.env);
