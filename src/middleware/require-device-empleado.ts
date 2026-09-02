import type { Request, Response, NextFunction } from "express";
import { getDeviceToken } from "../lib/device-token.js";
import { getEmpleadoByToken } from "../lib/empleados.js";

/**
 * Identifica al empleado por la cookie de dispositivo vinculada vía OTP en
 * /marcar (mismo mecanismo, sin login) — usado por el chat de RRHH, que
 * corre en un flujo público sin cuenta de usuario.
 */
export async function requireDeviceEmpleado(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = getDeviceToken(req);
  const empleado = token ? await getEmpleadoByToken(token) : null;
  if (!empleado) {
    res.status(401).json({ error: "Dispositivo no vinculado" });
    return;
  }
  req.empleado = empleado;
  next();
}
