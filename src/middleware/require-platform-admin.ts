import type { Request, Response, NextFunction } from "express";
import { checkPlatformAdmin } from "../lib/admin.js";

export async function requirePlatformAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  const isAdmin = await checkPlatformAdmin(req);
  if (!isAdmin) {
    res.status(403).json({ error: "No autorizado" });
    return;
  }

  next();
}
