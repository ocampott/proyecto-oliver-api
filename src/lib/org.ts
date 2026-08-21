import { createServiceClient } from "./supabase-service.js";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

export async function getOrgBySlug(slug: string): Promise<Organization | null> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("organizations")
    .select("id, name, slug, plan")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getCurrentOrg(userId: string): Promise<Organization | null> {
  const service = createServiceClient();

  const { data: membership, error: membershipErr } = await service
    .from("org_members")
    .select("org_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (membershipErr) throw membershipErr;
  if (!membership) return null;

  const { data: org, error: orgErr } = await service
    .from("organizations")
    .select("id, name, slug, plan")
    .eq("id", membership.org_id)
    .single();
  if (orgErr) throw orgErr;
  return org;
}
