import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { requireOrg } from "../middleware/require-org.js";
import { requireModulo } from "../middleware/require-modulo.js";
import { requireRole } from "../middleware/require-role.js";
import { createServiceClient } from "../lib/supabase-service.js";
import { validateBody } from "../lib/validation.js";
import { decisionSchema, cierreSchema, OperacionError } from "../lib/operacion-validacion.js";
import { guardarCierre, revisionOperacion } from "../lib/operacion.js";

export const operacionRouter = Router();
const acceso = [requireAuth, requireOrg, requireModulo("rrhh"), requireRole("owner", "admin")];
const idSchema = z.uuid();
function id(value: unknown): string {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) throw new OperacionError(400, "Identificador inválido.");
  return parsed.data;
}

operacionRouter.get("/rrhh/pendientes", ...acceso, async (req, res) => {
  const db = createServiceClient();
  const [solicitudes, certificados, rechazadas] = await Promise.all([
    db.from("ausencias").select("id, empleado_id, motivo, fecha_desde, fecha_hasta, detalle, certificado_pendiente, revision, estado, empleados(nombre, apellido)", { count: "exact" })
      .eq("org_id", req.org!.id).eq("estado", "pendiente").order("created_at").limit(50),
    db.from("ausencias").select("id, empleado_id, motivo, fecha_desde, empleados(nombre, apellido)", { count: "exact" })
      .eq("org_id", req.org!.id).eq("certificado_pendiente", true).neq("estado", "rechazada").order("created_at").limit(50),
    db.from("asistencia_rechazada").select("id", { count: "exact", head: true }).eq("org_id", req.org!.id).eq("resuelto", false),
  ]);
  for (const r of [solicitudes, certificados, rechazadas]) if (r.error) throw r.error;
  res.json({ solicitudes: solicitudes.data, certificados: certificados.data,
    totalSolicitudes: solicitudes.count, totalCertificados: certificados.count, marcasRechazadas: rechazadas.count });
});

operacionRouter.post("/ausencias/:id/decision", ...acceso, validateBody(decisionSchema), async (req, res) => {
  const { estado, revision, comentario } = req.body;
  const { data, error } = await createServiceClient().rpc("decidir_ausencia", {
    p_org: req.org!.id, p_id: id(req.params.id), p_revision: revision, p_estado: estado,
    p_comentario: comentario, p_actor: req.user!.id, p_email: req.user!.email ?? null,
  });
  if (error?.code === "40001") throw new OperacionError(409, "La solicitud cambió o ya fue resuelta. Actualizá antes de decidir.");
  if (error) throw error;
  res.json(data);
});

operacionRouter.get("/ausencias/:id/historial", ...acceso, async (req, res) => {
  const { data, error } = await createServiceClient().from("ausencias_historial").select("id, accion, actor_email, comentario, anterior, actual, created_at")
    .eq("org_id", req.org!.id).eq("ausencia_id", id(req.params.id)).order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  res.json(data);
});

operacionRouter.get("/liquidacion/cierres", ...acceso, async (req, res) => {
  const { data, error } = await createServiceClient().from("liquidacion_cierres")
    .select("id, desde, hasta, nota, actor_email, created_at, revision")
    .eq("org_id", req.org!.id).order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  res.json(data);
});
operacionRouter.post("/liquidacion/cierres", ...acceso, validateBody(cierreSchema), async (req, res) => {
  res.status(201).json(await guardarCierre(req.org!.id, req.body, req.user!));
});
operacionRouter.get("/liquidacion/cierres/:id", ...acceso, async (req, res) => {
  const db = createServiceClient();
  const { data, error } = await db.from("liquidacion_cierres").select("*")
    .eq("org_id", req.org!.id).eq("id", id(req.params.id)).maybeSingle();
  if (error) throw error;
  if (!data) throw new OperacionError(404, "Cierre no encontrado.");
  const { data: cambios, error: changesError } = await db.from("operacion_cambios").select("id, tabla, accion, registro_id, created_at")
    .eq("org_id", req.org!.id).gt("created_at", data.created_at).order("created_at", { ascending: false }).limit(100);
  if (changesError) throw changesError;
  res.json({ ...data, hayCambios: data.revision !== await revisionOperacion(req.org!.id), cambios });
});
