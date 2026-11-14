import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase is optional. When VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are
 * missing (e.g. a fresh clone before the `.env` is filled in), the app keeps
 * working in local only mode and every network helper becomes a no-op.
 */
// Значения продублированы из .env.production: publishable-ключ публичный,
// а на прод-сборке (telegup.mooo.com) переменные окружения иногда не
// подхватываются — без них «онлайн»/чат/профили не работают.
const url =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  "https://ceriqigcgogdubuwuavn.supabase.co";
const anonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  "sb_publishable_rkRrVs_csofBewAihoSMKA_RFSA8RHc";

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey, { auth: { persistSession: true } }) : null;

export const onlineEnabled = Boolean(supabase);