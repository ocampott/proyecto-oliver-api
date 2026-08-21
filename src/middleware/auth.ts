import type { Request, Response, NextFunction } from "express";
import { createAnonClient } from "../lib/supabase-anon.js";

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!token) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  const supabase = createAnonClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  req.user = data.user;
  next();
}
