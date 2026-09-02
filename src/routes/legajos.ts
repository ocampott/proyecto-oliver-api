import { Router, type Request, type Response } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth.js";
import { requireOrg } from "../middleware/require-org.js";
import { requireModulo } from "../middleware/require-modulo.js";
import { requireRole } from "../middleware/require-role.js";
import { getEmpleadoScoped } from "../lib/empleados.js";
import { parsePagination } from "../lib/pagination.js";
import {
  listLegajosResumen,
  listLegajoArchivos,
  getLegajoArchivo,
  guardarLegajoArchivo,
  descargarLegajoArchivo,
  eliminarLegajoArchivo,
} from "../lib/legajos.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

export const legajosRouter = Router();

interface ListQuery {
  page?: string;
  pageSize?: string;
  q?: string;
}

legajosRouter.get(
  "/legajos",
  requireAuth,
  requireOrg,
  requireModulo("rrhh"),
  requireRole("owner", "admin"),
  async (req: Request<Record<string, never>, unknown, unknown, ListQuery>, res: Response) => {
    const resultado = await listLegajosResumen(req.org!.id, {
      ...parsePagination(req.query as unknown as Record<string, unknown>),
      q: req.query.q,
    });
    res.json(resultado);
  }
);

legajosRouter.get(
  "/legajos/:empleadoId",
  requireAuth,
  requireOrg,
  requireModulo("rrhh"),
  requireRole("owner", "admin"),
  async (req: Request<{ empleadoId: string }>, res: Response) => {
    const empleado = await getEmpleadoScoped(req.org!.id, req.params.empleadoId);
    if (!empleado) {
      res.status(404).json({ error: "Empleado no encontrado" });
      return;
    }
    const archivos = await listLegajoArchivos(req.org!.id, empleado.id);
    res.json({ empleado, archivos });
  }
);

legajosRouter.post(
  "/legajos/:empleadoId",
  requireAuth,
  requireOrg,
  requireModulo("rrhh"),
  requireRole("owner", "admin"),
  upload.single("file"),
  async (req: Request<{ empleadoId: string }>, res: Response) => {
    const empleado = await getEmpleadoScoped(req.org!.id, req.params.empleadoId);
    if (!empleado) {
      res.status(404).json({ error: "Empleado no encontrado" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "Falta el archivo" });
      return;
    }
    try {
      const archivo = await guardarLegajoArchivo(req.org!.id, {
        empleadoId: empleado.id,
        nombreOriginal: req.file.originalname,
        buffer: req.file.buffer,
        mimetype: req.file.mimetype || "application/octet-stream",
        origen: "manual",
        subidoPor: req.user!.email,
      });
      res.status(201).json(archivo);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "Error al subir el archivo" });
    }
  }
);

legajosRouter.get(
  "/legajos/:empleadoId/:archivoId",
  requireAuth,
  requireOrg,
  requireModulo("rrhh"),
  requireRole("owner", "admin"),
  async (req: Request<{ empleadoId: string; archivoId: string }>, res: Response) => {
    const archivo = await getLegajoArchivo(req.org!.id, req.params.archivoId);
    if (!archivo || archivo.empleado_id !== req.params.empleadoId) {
      res.status(404).json({ error: "Archivo no encontrado" });
      return;
    }
    const buffer = await descargarLegajoArchivo(archivo);
    res.setHeader("Content-Type", archivo.mimetype);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(archivo.nombre_original)}"`);
    res.send(buffer);
  }
);

legajosRouter.delete(
  "/legajos/:empleadoId/:archivoId",
  requireAuth,
  requireOrg,
  requireModulo("rrhh"),
  requireRole("owner", "admin"),
  async (req: Request<{ empleadoId: string; archivoId: string }>, res: Response) => {
    const archivo = await getLegajoArchivo(req.org!.id, req.params.archivoId);
    if (!archivo || archivo.empleado_id !== req.params.empleadoId) {
      res.status(404).json({ error: "Archivo no encontrado" });
      return;
    }
    await eliminarLegajoArchivo(req.org!.id, archivo.id);
    res.json({ ok: true });
  }
);
