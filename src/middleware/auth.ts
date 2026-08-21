import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/jwt.js";

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!token) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  const user = await verifyAccessToken(token);
  if (!user) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  req.user = user;
  next();
}
