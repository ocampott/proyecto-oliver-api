import { Router } from "express";
import { requireDeviceEmpleado } from "../middleware/require-device-empleado.js";
import { getOrgBySlug } from "../lib/org.js";
import { getEntitlements, tieneModulo } from "../lib/planes.js";
import { createServiceClient } from "../lib/supabase-service.js";
import { listHorarios } from "../lib/turnos.js";
import { calcularSaldoVacacionesPuro } from "../lib/vacaciones-calculo.js";
import { getLegajoArchivo, descargarLegajoArchivo } from "../lib/legajos.js";
import { OperacionError } from "../lib/operacion-validacion.js";
import { z } from "zod";

export const portalRouter = Router();
portalRouter.use("/portal/:orgSlug", requireDeviceEmpleado, async (req, _res, next) => {
  const org = await getOrgBySlug(req.params.orgSlug as string);
  if (!org || org.id !== req.empleado!.org_id) throw new OperacionError(404, "Portal no disponible para este dispositivo.");
  const ent = await getEntitlements({ isPlatformAdmin: false }, org);
  if (!tieneModulo(ent, "rrhh")) throw new OperacionError(403, "El portal de RRHH no está disponible en el plan de tu organización.");
  next();
});

portalRouter.get("/portal/:orgSlug", async (req, res) => {
  const e = req.empleado!;
  const db = createServiceClient();
  const anio = Number(new Date().toLocaleDateString("sv", { timeZone: "America/Argentina/Buenos_Aires" }).slice(0, 4));
  const [horarios, solicitudes, archivos, vacaciones] = await Promise.all([
    listHorarios(e.org_id, e.id),
    db.from("ausencias").select("id, motivo, fecha_desde, fecha_hasta, estado, certificado_pendiente")
      .eq("org_id", e.org_id).eq("empleado_id", e.id).order("created_at", { ascending: false }).limit(50),
    db.from("legajo_archivos").select("id, nombre_original, created_at")
      .eq("org_id", e.org_id).eq("empleado_id", e.id).eq("visible_empleado", true).order("created_at", { ascending: false }).limit(50),
    db.from("ausencias").select("empleado_id, fecha_desde, fecha_hasta")
      .eq("org_id", e.org_id).eq("empleado_id", e.id).eq("estado", "aprobada").ilike("motivo", "Vacaciones")
      .gte("fecha_hasta", `${anio}-01-01`).lte("fecha_desde", `${anio}-12-31`),
  ]);
  for (const r of [solicitudes, archivos, vacaciones]) if (r.error) throw r.error;
  const saldo = calcularSaldoVacacionesPuro(anio, [{ id: e.id, nombre: e.nombre, fecha_ingreso: e.fecha_ingreso }], vacaciones.data ?? [])[0];
  res.setHeader("Cache-Control", "no-store");
  res.json({ nombre: e.nombre, horarios, solicitudes: solicitudes.data, archivos: archivos.data, vacaciones: saldo, anio });
});
portalRouter.get("/portal/:orgSlug/archivos/:id", async (req, res) => {
  if (!z.uuid().safeParse(req.params.id).success) throw new OperacionError(400, "Archivo inválido.");
  const archivo = await getLegajoArchivo(req.empleado!.org_id, req.params.id as string);
  if (!archivo || archivo.empleado_id !== req.empleado!.id || !archivo.visible_empleado) {
    throw new OperacionError(404, "Archivo no encontrado.");
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(archivo.nombre_original)}`);
  res.send(await descargarLegajoArchivo(archivo));
});
