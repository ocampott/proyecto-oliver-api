import { createServiceClient } from "./supabase-service.js";

export type OrgRole = "owner" | "admin" | "agent";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  /**
   * Rol del usuario autenticado dentro de esta organización. Solo viene
   * poblado cuando la org se resolvió a partir de una membership
   * (getCurrentOrg) — getOrgBySlug (flujo público de /marcar, sin usuario
   * autenticado) no tiene rol y lo deja undefined.
   */
  role?: OrgRole;
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

interface MembershipConOrg {
  role: OrgRole;
  organizations: { id: string; name: string; slug: string; plan: string } | null;
}

/**
 * Se llama en prácticamente todos los requests autenticados (vía
 * requireOrg), así que va con un solo round trip: PostgREST puede traer
 * la organización embebida a través del FK org_members.org_id →
 * organizations.id en la misma consulta, en vez de dos secuenciales.
 */
export async function getCurrentOrg(userId: string): Promise<Organization | null> {
  const service = createServiceClient();

  const { data: membership, error: membershipErr } = await service
    .from("org_members")
    .select("role, organizations (id, name, slug, plan)")
    .eq("user_id", userId)
    .maybeSingle<MembershipConOrg>();
  if (membershipErr) throw membershipErr;
  if (!membership || !membership.organizations) return null;

  return { ...membership.organizations, role: membership.role };
}
