import { createServiceClient } from "./supabase-service.js";

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}
