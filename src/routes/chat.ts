import { Router, type Request, type Response } from "express";
import multer from "multer";
import { getOrgBySlug } from "../lib/org.js";
import { getDeviceToken } from "../lib/device-token.js";
import { getEmpleadoByToken } from "../lib/empleados.js";
import { requireDeviceEmpleado } from "../middleware/require-device-empleado.js";
import { obtenerHistorial, procesarMensaje, procesarCertificado } from "../lib/chat-empleado.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

export const chatRouter = Router();

interface EstadoQuery {
  org: string;
}

chatRouter.get(
  "/chat/estado",
  async (req: Request<Record<string, never>, unknown, unknown, EstadoQuery>, res: Response) => {
    const { org: orgSlug } = req.query;
    if (!orgSlug) {
      res.status(400).json({ error: "Faltan datos" });
      return;
    }
    const org = await getOrgBySlug(orgSlug);
    if (!org) {
      res.status(404).json({ error: "Organización no encontrada" });
      return;
    }
    const token = getDeviceToken(req as unknown as Request);
    const empleado = token ? await getEmpleadoByToken(token) : null;
    if (!empleado || empleado.org_id !== org.id) {
      res.json({ vinculado: false });
      return;
    }
    res.json({ vinculado: true, empleadoNombre: empleado.nombre });
  }
);

chatRouter.get("/chat/historial", requireDeviceEmpleado, async (req: Request, res: Response) => {
  const historial = await obtenerHistorial(req.empleado!.org_id, req.empleado!);
  res.json(historial);
});

interface MensajeBody {
  texto?: string;
}

chatRouter.post("/chat/mensaje", requireDeviceEmpleado, async (req: Request<unknown, unknown, MensajeBody>, res: Response) => {
  const texto = req.body?.texto;
  if (!texto?.trim()) {
    res.status(400).json({ error: "Falta el mensaje" });
    return;
  }
  const respuesta = await procesarMensaje(req.empleado!.org_id, req.empleado!, texto);
  res.json(respuesta);
});

chatRouter.post(
  "/chat/certificado",
  requireDeviceEmpleado,
  upload.single("file"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "Falta el archivo" });
      return;
    }
    const respuesta = await procesarCertificado(req.empleado!.org_id, req.empleado!, {
      buffer: req.file.buffer,
      nombreOriginal: req.file.originalname,
      mimetype: req.file.mimetype || "application/octet-stream",
    });
    res.json(respuesta);
  }
);
