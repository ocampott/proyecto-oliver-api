import { createServiceClient } from "./supabase-service.js";
import { calcularLiquidacion } from "./liquidacion.js";
import { OperacionError } from "./operacion-validacion.js";
import type { AuthUser } from "./jwt.js";

export async function revisionOperacion(orgId: string): Promise<string> {
  const db = createServiceClient();
  const result = await db.from("operacion_revision").select("revision").eq("org_id", orgId).maybeSingle();
  if (result.error) throw result.error;
  if (result.data) return result.data.revision;
  // Solo para una organización nueva aún sin datos operativos.
  const { error: initError } = await db.from("operacion_revision").upsert({ org_id: orgId }, { onConflict: "org_id", ignoreDuplicates: true });
  if (initError) throw initError;
  const { data, error } = await db.from("operacion_revision").select("revision").eq("org_id", orgId).single();
  if (error) throw error;
  return data.revision;
}

export async function liquidacionRevisable(orgId: string, filters: { desde: string; hasta: string; empleadoIds?: string[] }) {
  const revision = await revisionOperacion(orgId);
  const filas = await calcularLiquidacion(orgId, filters);
  if (revision !== await revisionOperacion(orgId)) {
    throw new OperacionError(409, "Los datos cambiaron durante el cálculo. Volvé a actualizar.");
  }
  return { ...filters, filas, revision };
}

export async function guardarCierre(orgId: string, input: { desde: string; hasta: string; revision: string; nota: string }, actor: AuthUser) {
  const hoy = new Date().toLocaleDateString("sv", { timeZone: "America/Argentina/Buenos_Aires" });
  if (input.hasta >= hoy) throw new OperacionError(400, "Cerrá únicamente períodos terminados, anteriores a hoy.");
  const snapshot = await liquidacionRevisable(orgId, { desde: input.desde, hasta: input.hasta });
  if (snapshot.revision !== input.revision) throw new OperacionError(409, "Los datos cambiaron. Revisá la liquidación actualizada.");
  if (!snapshot.filas.length || snapshot.filas.some((f) => f.horas_en_curso)) {
    throw new OperacionError(409, "No se puede cerrar sin empleados o con marcas abiertas. Resolvé las alertas.");
  }
  const db = createServiceClient();
  const { count, error: pendientesError } = await db.from("ausencias").select("id", { head: true, count: "exact" })
    .eq("org_id", orgId).eq("estado", "pendiente").lte("fecha_desde", input.hasta).gte("fecha_hasta", input.desde);
  if (pendientesError) throw pendientesError;
  if (count) throw new OperacionError(409, "Hay solicitudes pendientes en el período. Revisalas antes de cerrar.");
  const { data, error } = await db.rpc("guardar_cierre", {
    p_org: orgId, p_desde: input.desde, p_hasta: input.hasta, p_revision: snapshot.revision,
    p_snapshot: snapshot, p_nota: input.nota, p_actor: actor.id, p_email: actor.email ?? null,
  });
  if (error?.code === "40001" || error?.code === "23505") {
    throw new OperacionError(409, "El período ya fue cerrado con estos datos o hubo cambios. Actualizá la lista.");
  }
  if (error) throw error;
  return { id: data };
}
