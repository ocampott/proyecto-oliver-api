import type { Request, Response, NextFunction } from "express";
import { isPlatformAdmin } from "../lib/admin.js";

export async function requirePlatformAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  const isAdmin = await isPlatformAdmin(req.user.id);
  if (!isAdmin) {
    res.status(403).json({ error: "No autorizado" });
    return;
  }

  next();
}
