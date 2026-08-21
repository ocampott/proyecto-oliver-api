import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env.js";

export function createAnonClient(): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false },
  });
}
