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

export async function updateOrganization(id: string, patch: { name?: string }): Promise<Organization> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("organizations")
    .update(patch)
    .eq("id", id)
    .select("id, name, slug, plan")
    .single();
  if (error) throw error;
  return data;
}

export interface OrgResumen {
  empleadosActivos: number;
  sucursalesActivas: number;
  miembros: number;
}

export async function getOrgResumen(orgId: string): Promise<OrgResumen> {
  const service = createServiceClient();
  const [empleados, sucursales, miembros] = await Promise.all([
    service.from("empleados").select("id", { count: "exact", head: true }).eq("org_id", orgId).neq("estado", "baja"),
    service.from("sucursales").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("activa", true),
    service.from("org_members").select("user_id", { count: "exact", head: true }).eq("org_id", orgId),
  ]);
  if (empleados.error) throw empleados.error;
  if (sucursales.error) throw sucursales.error;
  if (miembros.error) throw miembros.error;
  return {
    empleadosActivos: empleados.count ?? 0,
    sucursalesActivas: sucursales.count ?? 0,
    miembros: miembros.count ?? 0,
  };
}
