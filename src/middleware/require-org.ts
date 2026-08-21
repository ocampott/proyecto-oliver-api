import type { Request, Response, NextFunction } from "express";
import { getCurrentOrg } from "../lib/org.js";

export async function requireOrg(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  const org = await getCurrentOrg(req.user.id);
  if (!org) {
    res.status(403).json({ error: "Tu cuenta todavía no está asociada a ninguna organización." });
    return;
  }

  req.org = org;
  next();
}
