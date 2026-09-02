import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireOrg } from "../middleware/require-org.js";
import { requireModulo } from "../middleware/require-modulo.js";
import { requireRole } from "../middleware/require-role.js";
import { calcularSaldoVacaciones } from "../lib/vacaciones.js";

interface Query {
  anio?: string;
}

export const vacacionesRouter = Router();

vacacionesRouter.get(
  "/vacaciones",
  requireAuth,
  requireOrg,
  requireModulo("rrhh"),
  requireRole("owner", "admin"),
  async (req: Request<Record<string, never>, unknown, unknown, Query>, res: Response) => {
    const anio = req.query.anio ? Number(req.query.anio) : undefined;
    const saldos = await calcularSaldoVacaciones(req.org!.id, anio);
    res.json(saldos);
  }
);
