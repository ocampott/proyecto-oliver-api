import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env.js";

export function createServiceClient(): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
}
