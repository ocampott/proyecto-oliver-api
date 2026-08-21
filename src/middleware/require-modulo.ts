import type { Request, Response, NextFunction } from "express";
import { getEntitlements, planRequeridoParaModulo, tieneModulo, type Modulo } from "../lib/planes.js";

export function requireModulo(modulo: Modulo) {
  return async function (req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!req.user || !req.org) {
      res.status(401).json({ error: "No autorizado" });
      return;
    }

    const ent = await getEntitlements(req.org.id, req.user.id);
    if (!tieneModulo(ent, modulo)) {
      const planRequerido = planRequeridoParaModulo(modulo) ?? "basico";
      res.status(403).json({
        error: "modulo_no_incluido",
        modulo,
        planRequerido,
      });
      return;
    }

    next();
  };
}
