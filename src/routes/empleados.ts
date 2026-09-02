import { Router, type Request, type Response } from "express";
import type { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { requireOrg } from "../middleware/require-org.js";
import { requireRole } from "../middleware/require-role.js";
import { validateBody } from "../lib/validation.js";
import { crearEmpleadoSchema, editarEmpleadoSchema } from "./empleados.schemas.js";
import {
  listEmpleados,
  listEmpleadosPaginado,
  createEmpleadoConLimite,
  reactivarEmpleadoConLimite,
  updateEmpleado,
  desvincularDispositivo,
  getEmpleadoScoped,
  tieneAsistencia,
  deleteEmpleado,
  type Empleado,
  type EstadoEmpleado,
} from "../lib/empleados.js";
import { parsePagination } from "../lib/pagination.js";
import { getEntitlements, esErrorLimitePlan } from "../lib/planes.js";
import { getOtpVigente, generarOtp } from "../lib/otp.js";

type CrearBody = z.infer<typeof crearEmpleadoSchema>;
type EditarBody = z.infer<typeof editarEmpleadoSchema>;

export const empleadosRouter = Router();

interface EmpleadosListQuery {
  page?: string;
  pageSize?: string;
  q?: string;
  estado?: EstadoEmpleado;
  sucursalId?: string;
  cuil?: "con" | "sin";
  dispositivo?: "vinculado" | "no_vinculado";
}

async function conOtp(empleados: (Empleado & { tiene_asistencia: boolean })[]) {
  return Promise.all(
    empleados.map(async (e) => {
      if (e.device_token) return { ...e, otp: null };
      const otp = await getOtpVigente(e.id);
      return { ...e, otp: otp ? { code: otp.code, expires_at: otp.expires_at } : null };
    })
  );
}

empleadosRouter.get(
  "/empleados",
  requireAuth,
  requireOrg,
  async (req: Request<Record<string, never>, unknown, unknown, EmpleadosListQuery>, res: Response) => {
    const { q, estado, sucursalId, cuil, dispositivo, page, pageSize } = req.query;

    // Sin page/pageSize en la query: mantiene la respuesta vieja (array
    // plano, sin filtrar) — la usan varios selects/filtros de otras
    // páginas (RRHH, Asistencia, Turnos, Horas) que necesitan la nómina
    // completa, no una página. Paginar es opt-in según lo que mande el
    // caller, no automático.
    if (page === undefined && pageSize === undefined) {
      const empleados = await listEmpleados(req.org!.id);
      res.json(await conOtp(empleados));
      return;
    }

    const result = await listEmpleadosPaginado(req.org!.id, {
      ...parsePagination(req.query as unknown as Record<string, unknown>),
      q,
      estado,
      sucursalId,
      cuil,
      dispositivo,
    });
    res.json({ data: await conOtp(result.data), pagination: result.pagination });
  }
);

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
    if (body.tipo_pago !== undefined) patch.tipo_pago = body.tipo_pago;
    if (body.sueldo_mensual !== undefined) patch.sueldo_mensual = body.sueldo_mensual;
    if (body.valor_hora !== undefined) patch.valor_hora = body.valor_hora;
    if (body.valor_dia !== undefined) patch.valor_dia = body.valor_dia;

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
