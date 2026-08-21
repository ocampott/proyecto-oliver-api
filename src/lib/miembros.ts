import { createServiceClient } from "./supabase-service.js";
import { env } from "../env.js";

export type OrgRole = "owner" | "admin" | "agent";

export interface Miembro {
  userId: string;
  email: string;
  role: OrgRole;
  createdAt: string;
}

interface OrgMemberRow {
  user_id: string;
  role: OrgRole;
  created_at: string;
}

/**
 * No hay tabla propia con el email de cada miembro (vive en auth.users,
 * fuera de nuestro schema) — se resuelve con el Admin API por cada fila.
 * Los equipos son chicos (no hay UI de paginado en org_members todavía),
 * así que el N+1 acá es aceptable.
 */
export async function listMiembros(orgId: string): Promise<Miembro[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("org_members")
    .select("user_id, role, created_at")
    .eq("org_id", orgId)
    .order("created_at");
  if (error) throw error;

  const rows = data as OrgMemberRow[];
  const miembros = await Promise.all(
    rows.map(async (row): Promise<Miembro> => {
      const { data: userData, error: userErr } = await service.auth.admin.getUserById(row.user_id);
      if (userErr) throw userErr;
      return {
        userId: row.user_id,
        email: userData.user?.email ?? "(sin email)",
        role: row.role,
        createdAt: row.created_at,
      };
    })
  );
  return miembros;
}

/**
 * Invita a alguien a la organización: crea (o reutiliza) el usuario en
 * Supabase Auth y le manda el mail de invitación con un link para que
 * ponga su contraseña — no hace falta sistema de mails propio, lo maneja
 * Supabase. org_members.user_id es UNIQUE (un usuario pertenece a una
 * sola organización — v1, spec §8), así que si el email ya pertenece a
 * otra org la inserción falla con 23505 y se lo avisamos tal cual.
 */
export async function invitarMiembro(orgId: string, email: string): Promise<Miembro> {
  const service = createServiceClient();

  const { data: invited, error: inviteErr } = await service.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${env.corsOrigin}/bienvenida`,
  });
  if (inviteErr) {
    if (inviteErr.code === "email_exists") {
      throw new Error("Ese email ya tiene una cuenta en la plataforma.");
    }
    throw inviteErr;
  }

  const { error: insertErr } = await service
    .from("org_members")
    .insert({ user_id: invited.user.id, org_id: orgId, role: "admin" });
  if (insertErr) {
    if (insertErr.code === "23505") {
      throw new Error("Ese usuario ya pertenece a otra organización.");
    }
    throw insertErr;
  }

  return { userId: invited.user.id, email, role: "admin", createdAt: new Date().toISOString() };
}

export async function eliminarMiembro(orgId: string, userId: string): Promise<void> {
  const service = createServiceClient();
  const { data: row, error: readErr } = await service
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!row) throw new Error("Ese usuario no pertenece a esta organización.");
  if (row.role === "owner") throw new Error("No se puede quitar al dueño de la organización.");

  const { error } = await service.from("org_members").delete().eq("org_id", orgId).eq("user_id", userId);
  if (error) throw error;
}
