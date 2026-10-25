import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

export const storage = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } }).storage.from(config.PHOTO_BUCKET);
