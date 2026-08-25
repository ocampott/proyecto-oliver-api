import { Router, type Request, type Response } from "express";
import type { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { requireOrg } from "../middleware/require-org.js";
import { requireRole } from "../middleware/require-role.js";
import { validateBody } from "../lib/validation.js";
import { crearEmpleadoSchema, editarEmpleadoSchema } from "./empleados.schemas.js";
import {
  listEmpleados,
  createEmpleadoConLimite,
  reactivarEmpleadoConLimite,
  updateEmpleado,
  desvincularDispositivo,
  getEmpleadoScoped,
  tieneAsistencia,
  deleteEmpleado,
} from "../lib/empleados.js";
import { getEntitlements, esErrorLimitePlan } from "../lib/planes.js";
import { getOtpVigente, generarOtp } from "../lib/otp.js";

type CrearBody = z.infer<typeof crearEmpleadoSchema>;
type EditarBody = z.infer<typeof editarEmpleadoSchema>;

export const empleadosRouter = Router();

empleadosRouter.get("/empleados", requireAuth, requireOrg, async (req: Request, res: Response) => {
  const empleados = await listEmpleados(req.org!.id);
  const data = await Promise.all(
    empleados.map(async (e) => {
      if (e.device_token) return { ...e, otp: null };
      const otp = await getOtpVigente(e.id);
      return { ...e, otp: otp ? { code: otp.code, expires_at: otp.expires_at } : null };
    })
  );
  res.json(data);
});

empleadosRouter.post(
  "/empleados",
  requireAuth,
  requireOrg,
  requireRole("owner", "admin"),
  validateBody(crearEmpleadoSchema),
  async (req: Request<unknown, unknown, CrearBody>, res: Response) => {
    const { nombre, apellido, celular, cuil, fecha_ingreso, sucursal_id } = req.body;

    const ent = await getEntitlements(req, req.org!);
    try {
      const empleado = await createEmpleadoConLimite(
        req.org!.id,
        { nombre, apellido, celular, cuil, fecha_ingreso, sucursal_id },
        ent.maxEmpleados
      );
      res.status(201).json(empleado);
    } catch (e) {
      if (esErrorLimitePlan(e)) {
        res.status(403).json({ error: "limite_plan", recurso: "empleados", max: ent.maxEmpleados });
        return;
      }
      if (e instanceof Error && e.message === "cuil_duplicado") {
        res.status(409).json({ error: "Ya existe un empleado con ese CUIL en esta organización." });
        return;
      }
      throw e;
    }
  }
);

empleadosRouter.patch(
  "/empleados/:id",
  requireAuth,
  requireOrg,
  requireRole("owner", "admin"),
  validateBody(editarEmpleadoSchema),
  async (req: Request<{ id: string }, unknown, EditarBody>, res: Response) => {
    const { id } = req.params;
    const body = req.body;

    if (body.estado !== undefined) {
      const ent = await getEntitlements(req, req.org!);
      try {
        await reactivarEmpleadoConLimite(req.org!.id, id, body.estado, ent.maxEmpleados);
      } catch (e) {
        if (esErrorLimitePlan(e)) {
          res.status(403).json({ error: "limite_plan", recurso: "empleados", max: ent.maxEmpleados });
          return;
        }
        res.status(404).json({ error: "Empleado no encontrado" });
        return;
      }
    }

    const patch: Parameters<typeof updateEmpleado>[2] = {};
    if (body.nombre !== undefined) patch.nombre = body.nombre;
    if (body.apellido !== undefined) patch.apellido = body.apellido;
    if (body.celular !== undefined) patch.celular = body.celular;
    if (body.cuil !== undefined) patch.cuil = body.cuil;
    if (body.fecha_ingreso !== undefined) patch.fecha_ingreso = body.fecha_ingreso;
    if (body.sucursal_id !== undefined) patch.sucursal_id = body.sucursal_id;

    if (Object.keys(patch).length > 0) {
      try {
        const empleado = await updateEmpleado(req.org!.id, id, patch);
        res.json(empleado);
        return;
      } catch (e) {
        if (e instanceof Error && e.message === "cuil_duplicado") {
          res.status(409).json({ error: "Ya existe un empleado con ese CUIL en esta organización." });
          return;
        }
        throw e;
      }
    }
    res.json({ ok: true });
  }
);

empleadosRouter.delete(
  "/empleados/:id",
  requireAuth,
  requireOrg,
  requireRole("owner", "admin"),
  async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    const empleado = await getEmpleadoScoped(req.org!.id, id);
    if (!empleado) {
      res.status(404).json({ error: "Empleado no encontrado" });
      return;
    }
    if (empleado.estado !== "baja") {
      res.status(400).json({ error: "Dá de baja al empleado antes de eliminarlo." });
      return;
    }
    if (await tieneAsistencia(req.org!.id, id)) {
      res.status(400).json({ error: "No se puede eliminar: tiene marcaciones de asistencia registradas" });
      return;
    }
    await deleteEmpleado(req.org!.id, id);
    res.json({ ok: true });
  }
);

empleadosRouter.post(
  "/empleados/:id/desvincular",
  requireAuth,
  requireOrg,
  requireRole("owner", "admin"),
  async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    await desvincularDispositivo(req.org!.id, id);
    res.json({ ok: true });
  }
);

empleadosRouter.post(
  "/empleados/:id/otp",
  requireAuth,
  requireOrg,
  requireRole("owner", "admin"),
  async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    try {
      const code = await generarOtp(req.org!.id, id);
      res.json({ code });
    } catch {
      res.status(404).json({ error: "Empleado no encontrado" });
    }
  }
);
