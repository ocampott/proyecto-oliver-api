import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireOrg } from "../middleware/require-org.js";
import {
  listEmpleados,
  createEmpleado,
  updateEmpleado,
  setEmpleadoActivo,
  desvincularDispositivo,
  countEmpleadosActivos,
} from "../lib/empleados.js";
import { getEntitlements, puedeCrearEmpleado } from "../lib/planes.js";
import { getOtpVigente, generarOtp } from "../lib/otp.js";

interface CrearBody {
  nombre?: string;
  celular?: string;
}

interface EditarBody {
  nombre?: string;
  celular?: string | null;
  activo?: boolean;
}

export const empleadosRouter = Router();

empleadosRouter.get("/empleados", requireAuth, requireOrg, async (req: Request, res: Response) => {
  const empleados = await listEmpleados(req.org!.id);
  const data = await Promise.all(
    empleados.map(async (e) => {
      if (e.device_token) return { ...e, otp: null };
      const otp = await getOtpVigente(e.id);
      return { ...e, otp: otp ? { code: otp.code, expires_at: otp.expires_at } : null };
    })
  );
  res.json(data);
});

empleadosRouter.post(
  "/empleados",
  requireAuth,
  requireOrg,
  async (req: Request<unknown, unknown, CrearBody>, res: Response) => {
    const { nombre, celular } = req.body ?? {};
    if (!nombre?.trim()) {
      res.status(400).json({ error: "El nombre es requerido" });
      return;
    }

    const ent = await getEntitlements(req.org!.id, req.user!.id);
    const activos = await countEmpleadosActivos(req.org!.id);
    if (!puedeCrearEmpleado(ent, activos)) {
      res.status(403).json({
        error: "limite_plan",
        recurso: "empleados",
        max: ent.maxEmpleados,
      });
      return;
    }

    const empleado = await createEmpleado(req.org!.id, {
      nombre: nombre.trim(),
      celular: celular?.trim() || undefined,
    });
    res.status(201).json(empleado);
  }
);

empleadosRouter.patch(
  "/empleados/:id",
  requireAuth,
  requireOrg,
  async (req: Request<{ id: string }, unknown, EditarBody>, res: Response) => {
    const { id } = req.params;
    const body = req.body ?? {};

    if (typeof body.activo === "boolean") {
      await setEmpleadoActivo(req.org!.id, id, body.activo);
    }

    const patch: { nombre?: string; celular?: string | null } = {};
    if (typeof body.nombre === "string" && body.nombre.trim()) patch.nombre = body.nombre.trim();
    if (body.celular !== undefined) patch.celular = body.celular?.trim() || null;

    if (Object.keys(patch).length > 0) {
      const empleado = await updateEmpleado(req.org!.id, id, patch);
      res.json(empleado);
      return;
    }
    res.json({ ok: true });
  }
);

empleadosRouter.delete(
  "/empleados/:id",
  requireAuth,
  requireOrg,
  async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    await setEmpleadoActivo(req.org!.id, id, false);
    res.json({ ok: true });
  }
);

empleadosRouter.post(
  "/empleados/:id/desvincular",
  requireAuth,
  requireOrg,
  async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    await desvincularDispositivo(req.org!.id, id);
    res.json({ ok: true });
  }
);

empleadosRouter.post(
  "/empleados/:id/otp",
  requireAuth,
  requireOrg,
  async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    try {
      const code = await generarOtp(req.org!.id, id);
      res.json({ code });
    } catch {
      res.status(404).json({ error: "Empleado no encontrado" });
    }
  }
);
