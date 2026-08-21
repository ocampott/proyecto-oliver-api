import type { Request, Response, NextFunction } from "express";
import type { OrgRole } from "../lib/org.js";
import { checkPlatformAdmin } from "../lib/admin.js";

/**
 * Requiere que el rol del usuario dentro de su organización (req.org.role,
 * seteado por requireOrg) esté en la lista permitida. Un platform_admin
 * (superadmin) bypasea esto siempre, igual que bypasea los límites de plan
 * (ver Entitlements.ilimitado) — es la misma regla "superadmin sin límites,
 * nunca" aplicada acá.
 */
export function requireRole(...roles: OrgRole[]) {
  return async function (req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!req.user || !req.org) {
      res.status(401).json({ error: "No autorizado" });
      return;
    }

    if (await checkPlatformAdmin(req)) {
      next();
      return;
    }

    if (!req.org.role || !roles.includes(req.org.role)) {
      res.status(403).json({ error: "No tenés permiso para hacer esto." });
      return;
    }

    next();
  };
}
