import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireOrg } from "../middleware/require-org.js";
import { requireModulo } from "../middleware/require-modulo.js";
import { requireRole } from "../middleware/require-role.js";
import { validateBody } from "../lib/validation.js";
import {
  listAdelantos,
  crearAdelanto,
  deleteAdelanto,
  calcularTopeAdelanto,
  getTopeConfig,
  setTopeConfig,
  type TipoTopeAdelanto,
} from "../lib/adelantos.js";
import { getEmpleadoById } from "../lib/empleados.js";
import { crearAdelantoSchema, configTopeSchema } from "./adelantos.schemas.js";

interface ListQuery {
  desde?: string;
  hasta?: string;
  empleadoId?: string;
}

interface TopeQuery {
  empleadoId?: string;
  fecha?: string;
}

export const adelantosRouter = Router();

function formatARS(n: number): string {
  return `$${Math.round(n).toLocaleString("es-AR")}`;
}

adelantosRouter.get(
  "/adelantos",
  requireAuth,
  requireOrg,
  requireModulo("rrhh"),
  async (req: Request<Record<string, never>, unknown, unknown, ListQuery>, res: Response) => {
    const { desde, hasta, empleadoId } = req.query;
    const data = await listAdelantos(req.org!.id, { desde, hasta, empleadoId });
    res.json(data);
  }
);

adelantosRouter.get(
  "/adelantos/tope",
  requireAuth,
  requireOrg,
  requireModulo("rrhh"),
  async (req: Request<Record<string, never>, unknown, unknown, TopeQuery>, res: Response) => {
    const { empleadoId, fecha } = req.query;
    if (!empleadoId || !fecha) {
      res.status(400).json({ error: "Faltan empleadoId y fecha" });
      return;
    }
    const tope = await calcularTopeAdelanto(req.org!.id, empleadoId, fecha);
    res.json(tope);
  }
);

adelantosRouter.post(
  "/adelantos",
  requireAuth,
  requireOrg,
  requireModulo("rrhh"),
  requireRole("owner", "admin"),
  validateBody(crearAdelantoSchema),
  async (req: Request, res: Response) => {
    const { empleadoId, fecha, monto, nota } = req.body as {
      empleadoId: string;
      fecha: string;
      monto: number;
      nota?: string | null;
    };

    const empleado = await getEmpleadoById(empleadoId);
    if (!empleado || empleado.org_id !== req.org!.id) {
      res.status(404).json({ error: "Empleado no encontrado" });
      return;
    }

    const adelanto = await crearAdelanto(req.org!.id, { empleadoId, fecha, monto, nota });

    const tope = await calcularTopeAdelanto(req.org!.id, empleadoId, fecha);
    let advertencia: string | null = null;
    if (tope.limite !== null && tope.usado > tope.limite) {
      advertencia = `Supera el tope configurado: lleva ${formatARS(tope.usado)} adelantados este mes sobre un tope de ${formatARS(tope.limite)}.`;
    } else if (tope.tipo === "porcentaje" && tope.limite === null) {
      advertencia = "No se pudo validar el tope porque el empleado no es mensual o no tiene sueldo configurado en Empleados.";
    }

    res.status(201).json({ ...adelanto, advertencia });
  }
);

adelantosRouter.get(
  "/adelantos/config",
  requireAuth,
  requireOrg,
  requireModulo("rrhh"),
  async (req: Request, res: Response) => {
    res.json(await getTopeConfig(req.org!.id));
  }
);

adelantosRouter.patch(
  "/adelantos/config",
  requireAuth,
  requireOrg,
  requireModulo("rrhh"),
  requireRole("owner", "admin"),
  validateBody(configTopeSchema),
  async (req: Request, res: Response) => {
    const { tipo, valor } = req.body as { tipo: TipoTopeAdelanto; valor: number };
    await setTopeConfig(req.org!.id, { tipo, valor });
    res.json({ ok: true });
  }
);

adelantosRouter.delete(
  "/adelantos/:id",
  requireAuth,
  requireOrg,
  requireModulo("rrhh"),
  requireRole("owner", "admin"),
  async (req: Request<{ id: string }>, res: Response) => {
    await deleteAdelanto(req.org!.id, req.params.id);
    res.json({ ok: true });
  }
);
