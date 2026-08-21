import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireOrg } from "../middleware/require-org.js";
import { requireModulo } from "../middleware/require-modulo.js";
import { requireRole } from "../middleware/require-role.js";
import {
  listHorarios,
  insertHorario,
  updateHorario,
  deleteHorario,
  insertHorariosBulk,
  listTurnoTemplates,
  insertTurnoTemplate,
  updateTurnoTemplate,
  deleteTurnoTemplate,
  getTolerancia,
  setTolerancia,
  calcularCumplimiento,
} from "../lib/turnos.js";
import { getEmpleadoById, listEmpleados } from "../lib/empleados.js";
import { getSucursal } from "../lib/sucursales.js";

const AR_TZ = "America/Argentina/Buenos_Aires";

function hoyAR(): string {
  return new Date().toLocaleDateString("sv", { timeZone: AR_TZ });
}

function inicioDeMesAR(): string {
  return `${hoyAR().slice(0, 7)}-01`;
}

interface HorariosQuery {
  empleadoId?: string;
}

interface CrearHorarioBody {
  empleado_id?: string;
  sucursal_id?: string | null;
  dia_semana?: number;
  hora_inicio?: string;
  hora_fin?: string;
  tolerancia_min?: number | null;
}

interface EditarHorarioBody {
  sucursal_id?: string | null;
  dia_semana?: number;
  hora_inicio?: string;
  hora_fin?: string;
  tolerancia_min?: number | null;
}

interface BulkBody {
  empleado_ids?: string[];
  dias_semana?: number[];
  hora_inicio?: string;
  hora_fin?: string;
  tolerancia_min?: number | null;
}

interface TemplateBody {
  nombre?: string;
  hora_inicio?: string;
  hora_fin?: string;
  dias_semana?: number[];
  tolerancia_min?: number | null;
}

interface ToleranciaBody {
  tolerancia_min?: number;
}

interface CumplimientoQuery {
  desde?: string;
  hasta?: string;
  sucursalId?: string;
  empleadoId?: string;
}

export const turnosRouter = Router();

turnosRouter.get(
  "/horarios",
  requireAuth,
  requireOrg,
  requireModulo("turnos"),
  requireRole("owner", "admin"),
  async (req: Request<Record<string, never>, unknown, unknown, HorariosQuery>, res: Response) => {
    const data = await listHorarios(req.org!.id, req.query.empleadoId);
    res.json(data);
  }
);

turnosRouter.post(
  "/horarios",
  requireAuth,
  requireOrg,
  requireModulo("turnos"),
  requireRole("owner", "admin"),
  async (req: Request<unknown, unknown, CrearHorarioBody>, res: Response) => {
    const { empleado_id, sucursal_id, dia_semana, hora_inicio, hora_fin, tolerancia_min } = req.body ?? {};
    if (!empleado_id || dia_semana === undefined || !hora_inicio || !hora_fin) {
      res.status(400).json({ error: "Faltan datos del turno" });
      return;
    }
    const empleado = await getEmpleadoById(empleado_id);
    if (!empleado || empleado.org_id !== req.org!.id) {
      res.status(400).json({ error: "Empleado inválido" });
      return;
    }
    if (sucursal_id) {
      const sucursal = await getSucursal(req.org!.id, sucursal_id);
      if (!sucursal) {
        res.status(400).json({ error: "Sucursal inválida" });
        return;
      }
    }
    await insertHorario(req.org!.id, { empleado_id, sucursal_id, dia_semana, hora_inicio, hora_fin, tolerancia_min });
    res.json({ ok: true });
  }
);

turnosRouter.patch(
  "/horarios/:id",
  requireAuth,
  requireOrg,
  requireModulo("turnos"),
  requireRole("owner", "admin"),
  async (req: Request<{ id: string }, unknown, EditarHorarioBody>, res: Response) => {
    const body = req.body ?? {};
    if (body.sucursal_id !== undefined && body.sucursal_id !== null) {
      const sucursal = await getSucursal(req.org!.id, body.sucursal_id);
      if (!sucursal) {
        res.status(400).json({ error: "Sucursal inválida" });
        return;
      }
    }
    const patch: Parameters<typeof updateHorario>[2] = {};
    if (body.sucursal_id !== undefined) patch.sucursal_id = body.sucursal_id;
    if (body.dia_semana !== undefined) patch.dia_semana = body.dia_semana;
    if (body.hora_inicio !== undefined) patch.hora_inicio = body.hora_inicio;
    if (body.hora_fin !== undefined) patch.hora_fin = body.hora_fin;
    if (body.tolerancia_min !== undefined) patch.tolerancia_min = body.tolerancia_min;
    await updateHorario(req.org!.id, req.params.id, patch);
    res.json({ ok: true });
  }
);

turnosRouter.delete(
  "/horarios/:id",
  requireAuth,
  requireOrg,
  requireModulo("turnos"),
  requireRole("owner", "admin"),
  async (req: Request<{ id: string }>, res: Response) => {
    await deleteHorario(req.org!.id, req.params.id);
    res.json({ ok: true });
  }
);

turnosRouter.post(
  "/horarios/bulk",
  requireAuth,
  requireOrg,
  requireModulo("turnos"),
  requireRole("owner", "admin"),
  async (req: Request<unknown, unknown, BulkBody>, res: Response) => {
    const { empleado_ids, dias_semana, hora_inicio, hora_fin, tolerancia_min } = req.body ?? {};
    if (!empleado_ids?.length || !dias_semana?.length || !hora_inicio || !hora_fin) {
      res.status(400).json({ error: "Faltan datos para asignar el turno" });
      return;
    }
    const empleadosOrg = await listEmpleados(req.org!.id);
    const idsValidos = new Set(empleadosOrg.map((e) => e.id));
    if (!empleado_ids.every((id) => idsValidos.has(id))) {
      res.status(400).json({ error: "Uno o más empleados no son válidos" });
      return;
    }
    await insertHorariosBulk(req.org!.id, { empleado_ids, dias_semana, hora_inicio, hora_fin, tolerancia_min });
    res.json({ ok: true });
  }
);

turnosRouter.get("/turno-templates", requireAuth, requireOrg, requireModulo("turnos"), requireRole("owner", "admin"), async (req: Request, res: Response) => {
  const data = await listTurnoTemplates(req.org!.id);
  res.json(data);
});

turnosRouter.post(
  "/turno-templates",
  requireAuth,
  requireOrg,
  requireModulo("turnos"),
  requireRole("owner", "admin"),
  async (req: Request<unknown, unknown, TemplateBody>, res: Response) => {
    const { nombre, hora_inicio, hora_fin, dias_semana, tolerancia_min } = req.body ?? {};
    if (!nombre?.trim() || !hora_inicio || !hora_fin) {
      res.status(400).json({ error: "Faltan datos de la plantilla" });
      return;
    }
    try {
      await insertTurnoTemplate(req.org!.id, {
        nombre: nombre.trim(),
        hora_inicio,
        hora_fin,
        dias_semana: dias_semana ?? [],
        tolerancia_min,
      });
    } catch (e) {
      res.status(409).json({ error: e instanceof Error ? e.message : "No se pudo crear la plantilla" });
      return;
    }
    res.json({ ok: true });
  }
);

turnosRouter.patch(
  "/turno-templates/:id",
  requireAuth,
  requireOrg,
  requireModulo("turnos"),
  requireRole("owner", "admin"),
  async (req: Request<{ id: string }, unknown, TemplateBody>, res: Response) => {
    const body = req.body ?? {};
    if (body.nombre !== undefined && !body.nombre.trim()) {
      res.status(400).json({ error: "Faltan datos de la plantilla" });
      return;
    }
    const patch: Parameters<typeof updateTurnoTemplate>[2] = {};
    if (body.nombre !== undefined) patch.nombre = body.nombre.trim();
    if (body.hora_inicio !== undefined) patch.hora_inicio = body.hora_inicio;
    if (body.hora_fin !== undefined) patch.hora_fin = body.hora_fin;
    if (body.dias_semana !== undefined) patch.dias_semana = body.dias_semana;
    if (body.tolerancia_min !== undefined) patch.tolerancia_min = body.tolerancia_min;
    try {
      await updateTurnoTemplate(req.org!.id, req.params.id, patch);
    } catch (e) {
      res.status(409).json({ error: e instanceof Error ? e.message : "No se pudo editar la plantilla" });
      return;
    }
    res.json({ ok: true });
  }
);

turnosRouter.delete(
  "/turno-templates/:id",
  requireAuth,
  requireOrg,
  requireModulo("turnos"),
  requireRole("owner", "admin"),
  async (req: Request<{ id: string }>, res: Response) => {
    await deleteTurnoTemplate(req.org!.id, req.params.id);
    res.json({ ok: true });
  }
);

turnosRouter.get("/turnos/tolerancia", requireAuth, requireOrg, requireModulo("turnos"), requireRole("owner", "admin"), async (req: Request, res: Response) => {
  res.json({ tolerancia_min: await getTolerancia(req.org!.id) });
});

turnosRouter.patch(
  "/turnos/tolerancia",
  requireAuth,
  requireOrg,
  requireModulo("turnos"),
  requireRole("owner", "admin"),
  async (req: Request<unknown, unknown, ToleranciaBody>, res: Response) => {
    const min = Number(req.body?.tolerancia_min);
    if (!Number.isFinite(min) || min < 0) {
      res.status(400).json({ error: "tolerancia_min inválida" });
      return;
    }
    await setTolerancia(req.org!.id, Math.round(min));
    res.json({ ok: true });
  }
);

turnosRouter.get(
  "/turnos/cumplimiento",
  requireAuth,
  requireOrg,
  requireModulo("turnos"),
  requireRole("owner", "admin"),
  async (req: Request<Record<string, never>, unknown, unknown, CumplimientoQuery>, res: Response) => {
    const desde = req.query.desde ?? inicioDeMesAR();
    const hasta = req.query.hasta ?? hoyAR();
    const data = await calcularCumplimiento(req.org!.id, {
      desde,
      hasta,
      sucursalId: req.query.sucursalId,
      empleadoId: req.query.empleadoId,
    });
    res.json(data);
  }
);
