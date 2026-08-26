import { createServiceClient } from "./supabase-service.js";
import type { Organization } from "./org.js";
import { rangeFor, buildMeta, type PaginationParams, type Paginated } from "./pagination.js";

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

export interface OrganizationListRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  created_at: string;
}

export interface ListOrganizationsParams extends PaginationParams {
  q?: string;
}

export async function listOrganizations(params: ListOrganizationsParams): Promise<Paginated<OrganizationListRow>> {
  const service = createServiceClient();
  const { from, to } = rangeFor(params);

  let query = service
    .from("organizations")
    .select("id, name, slug, plan, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (params.q) {
    const qSafe = params.q.trim().replace(/[%,()]/g, "");
    if (qSafe) query = query.or(`name.ilike.%${qSafe}%,slug.ilike.%${qSafe}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data as OrganizationListRow[], pagination: buildMeta(params, count ?? 0) };
}

/**
 * Una sola organización por id — la necesita OrganizacionDetallePage.tsx
 * para el encabezado del detalle. Antes de esta tarea esa página resolvía
 * el nombre buscando dentro de la lista completa de organizaciones
 * (`useOrganizacionesAdmin().find(...)`); con esa lista paginada a 10/20/30,
 * ese `.find()` deja de encontrar organizaciones fuera de la primera
 * página — hace falta un fetch de a una.
 */
export async function getOrganization(id: string): Promise<OrganizationListRow | null> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("organizations")
    .select("id, name, slug, plan, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as OrganizationListRow | null;
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
