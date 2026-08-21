import { Router, type Request, type Response } from "express";
import QRCode from "qrcode";
import { requireAuth } from "../middleware/auth.js";
import { requireOrg } from "../middleware/require-org.js";
import { requireRole } from "../middleware/require-role.js";
import {
  listSucursales,
  createSucursalConLimite,
  reactivarSucursalConLimite,
  updateSucursal,
  getSucursal,
  tieneAsistencia,
  deleteSucursal,
} from "../lib/sucursales.js";
import { getEntitlements, esErrorLimitePlan } from "../lib/planes.js";
import { env } from "../env.js";

interface CrearBody {
  nombre?: string;
  lat?: number;
  lon?: number;
  radio_metros?: number;
  direccion?: string | null;
}

interface EditarBody {
  nombre?: string;
  lat?: number | null;
  lon?: number | null;
  radio_metros?: number;
  direccion?: string | null;
  activa?: boolean;
}

export const sucursalesRouter = Router();

sucursalesRouter.get("/sucursales", requireAuth, requireOrg, async (req: Request, res: Response) => {
  const data = await listSucursales(req.org!.id);
  res.json(data);
});

sucursalesRouter.post(
  "/sucursales",
  requireAuth,
  requireOrg,
  requireRole("owner", "admin"),
  async (req: Request<unknown, unknown, CrearBody>, res: Response) => {
    const { nombre, lat, lon, radio_metros, direccion } = req.body ?? {};
    if (!nombre?.trim()) {
      res.status(400).json({ error: "El nombre es requerido" });
      return;
    }

    const ent = await getEntitlements(req.org!.id, req.user!.id);
    try {
      const sucursal = await createSucursalConLimite(
        req.org!.id,
        { nombre: nombre.trim(), lat, lon, radio_metros, direccion },
        ent.maxSucursales
      );
      res.status(201).json(sucursal);
    } catch (e) {
      if (esErrorLimitePlan(e)) {
        res.status(403).json({ error: "limite_plan", recurso: "sucursales", max: ent.maxSucursales });
        return;
      }
      throw e;
    }
  }
);

sucursalesRouter.patch(
  "/sucursales/:id",
  requireAuth,
  requireOrg,
  requireRole("owner", "admin"),
  async (req: Request<{ id: string }, unknown, EditarBody>, res: Response) => {
    const { id } = req.params;
    const body = req.body ?? {};

    const patch: Parameters<typeof updateSucursal>[2] = {};
    if (typeof body.nombre === "string" && body.nombre.trim()) patch.nombre = body.nombre.trim();
    if (body.lat !== undefined) patch.lat = body.lat;
    if (body.lon !== undefined) patch.lon = body.lon;
    if (body.radio_metros !== undefined) patch.radio_metros = body.radio_metros;
    if (body.direccion !== undefined) patch.direccion = body.direccion;

    if (body.activa === true) {
      const ent = await getEntitlements(req.org!.id, req.user!.id);
      let reactivada;
      try {
        reactivada = await reactivarSucursalConLimite(req.org!.id, id, ent.maxSucursales);
      } catch (e) {
        if (esErrorLimitePlan(e)) {
          res.status(403).json({ error: "limite_plan", recurso: "sucursales", max: ent.maxSucursales });
          return;
        }
        res.status(404).json({ error: "Sucursal no encontrada" });
        return;
      }
      if (Object.keys(patch).length === 0) {
        res.json(reactivada);
        return;
      }
    } else if (typeof body.activa === "boolean") {
      patch.activa = false;
    }

    const sucursal = await updateSucursal(req.org!.id, id, patch);
    res.json(sucursal);
  }
);

sucursalesRouter.delete(
  "/sucursales/:id",
  requireAuth,
  requireOrg,
  requireRole("owner", "admin"),
  async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    const sucursal = await getSucursal(req.org!.id, id);
    if (!sucursal) {
      res.status(404).json({ error: "Sucursal no encontrada" });
      return;
    }
    if (sucursal.activa) {
      res.status(400).json({ error: "Desactivá la sucursal antes de eliminarla" });
      return;
    }
    if (await tieneAsistencia(req.org!.id, id)) {
      res.status(400).json({ error: "No se puede eliminar: tiene marcaciones de asistencia registradas" });
      return;
    }
    await deleteSucursal(req.org!.id, id);
    res.json({ ok: true });
  }
);

sucursalesRouter.get(
  "/sucursales/:id/qr",
  requireAuth,
  requireOrg,
  async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    const sucursal = await getSucursal(req.org!.id, id);
    if (!sucursal) {
      res.status(404).json({ error: "Sucursal no encontrada" });
      return;
    }
    const url = `${env.marcarBaseUrl}/marcar/${req.org!.slug}/${sucursal.id}`;
    const png = await QRCode.toBuffer(url, { width: 600, margin: 2 });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", `inline; filename="qr-${sucursal.nombre}.png"`);
    res.send(png);
  }
);
