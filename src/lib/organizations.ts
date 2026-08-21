import { createServiceClient } from "./supabase-service.js";
import type { Organization } from "./org.js";

export interface CreateOrganizationInput {
  name: string;
  slug: string;
}

export async function createOrganization(input: CreateOrganizationInput): Promise<Organization> {
  const service = createServiceClient();

  const { data: org, error: orgErr } = await service
    .from("organizations")
    .insert({ name: input.name, slug: input.slug })
    .select()
    .single();
  if (orgErr) throw orgErr;

  const { error: settingsErr } = await service
    .from("org_settings")
    .insert({ org_id: org.id });
  if (settingsErr) throw settingsErr;

  return org;
}
