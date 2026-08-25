import { Router, type Request, type Response } from "express";
import QRCode from "qrcode";
import { GlobalFonts, createCanvas, loadImage } from "@napi-rs/canvas";
import path from "path";
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
import { validateBody } from "../lib/validation.js";
import { crearSucursalSchema, editarSucursalSchema } from "./sucursales.schemas.js";
import type { z } from "zod";

type CrearBody = z.infer<typeof crearSucursalSchema>;
type EditarBody = z.infer<typeof editarSucursalSchema>;

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
  validateBody(crearSucursalSchema),
  async (req: Request<unknown, unknown, CrearBody>, res: Response) => {
    const { nombre, lat, lon, radio_metros, direccion } = req.body;

    const ent = await getEntitlements(req, req.org!);
    try {
      const sucursal = await createSucursalConLimite(
        req.org!.id,
        { nombre, lat, lon, radio_metros, direccion },
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
  validateBody(editarSucursalSchema),
  async (req: Request<{ id: string }, unknown, EditarBody>, res: Response) => {
    const { id } = req.params;
    const body = req.body;

    const patch: Parameters<typeof updateSucursal>[2] = {};
    if (body.nombre !== undefined) patch.nombre = body.nombre;
    if (body.lat !== undefined) patch.lat = body.lat;
    if (body.lon !== undefined) patch.lon = body.lon;
    if (body.radio_metros !== undefined) patch.radio_metros = body.radio_metros;
    if (body.direccion !== undefined) patch.direccion = body.direccion;

    if (body.activa === true) {
      const ent = await getEntitlements(req, req.org!);
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

// Franja blanca abajo del QR con la marca "oliver", con la misma fuente
// (Archivo ExtraBold) que usa el wordmark del navbar — no un sans-serif
// genérico. Se agrega como una franja aparte en vez de superponerla sobre
// los módulos del QR para no arriesgar la escaneabilidad — no hace falta
// tocar el nivel de corrección de errores.
const QR_WIDTH = 600;
const QR_CAPTION_HEIGHT = 50;
const ARCHIVO_FAMILY = "Archivo ExtraBold";

// process.cwd() en vez de una ruta relativa al archivo compilado: tsc no
// copia assets no-TS a dist/, pero tanto `npm run dev` (tsx) como
// `npm start` (node dist/index.js) se invocan desde la raíz del repo, así
// que esta ruta resuelve igual en los dos casos.
GlobalFonts.registerFromPath(
  path.join(process.cwd(), "src/assets/fonts/Archivo-ExtraBold.woff2"),
  ARCHIVO_FAMILY
);

async function conMarcaOliver(qrPng: Buffer): Promise<Buffer> {
  const canvas = createCanvas(QR_WIDTH, QR_WIDTH + QR_CAPTION_HEIGHT);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, QR_WIDTH, QR_WIDTH + QR_CAPTION_HEIGHT);

  const qrImg = await loadImage(qrPng);
  ctx.drawImage(qrImg, 0, 0, QR_WIDTH, QR_WIDTH);

  ctx.fillStyle = "#18181b";
  ctx.font = `26px "${ARCHIVO_FAMILY}"`;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("oliver", QR_WIDTH - 20, QR_WIDTH + QR_CAPTION_HEIGHT - 16);

  return canvas.toBuffer("image/png");
}

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
    const qrPng = await QRCode.toBuffer(url, { width: QR_WIDTH, margin: 2 });
    const png = await conMarcaOliver(qrPng);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", `inline; filename="qr-${sucursal.nombre}.png"`);
    res.send(png);
  }
);
