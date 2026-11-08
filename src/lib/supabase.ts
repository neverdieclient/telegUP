import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase is optional. When VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are
 * missing (e.g. a fresh clone before the `.env` is filled in), the app keeps
 * working in local only mode and every network helper becomes a no-op.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey, { auth: { persistSession: true } }) : null;

export const onlineEnabled = Boolean(supabase);