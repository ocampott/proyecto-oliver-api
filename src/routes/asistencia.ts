import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireOrg } from "../middleware/require-org.js";
import {
  listAsistencia,
  deleteAsistencia,
  listRechazadas,
  aprobarRechazada,
  descartarRechazada,
  type MotivoRechazo,
} from "../lib/asistencia.js";
import { generarExcel, enviarExcel } from "../lib/excel.js";

const AR_TZ = "America/Argentina/Buenos_Aires";

function hoyAR(): string {
  return new Date().toLocaleDateString("sv", { timeZone: AR_TZ });
}

function fechaHoraAR(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: AR_TZ,
  });
}

const MOTIVOS: Record<MotivoRechazo, string> = {
  fuera_de_rango: "Fuera de rango",
  sucursal_sin_gps: "Sucursal sin GPS configurado",
  nombre_no_encontrado: "Nombre no encontrado en la nómina",
  dispositivo_ya_vinculado: "Ya vinculado a otro dispositivo",
};

interface ListQuery {
  desde?: string;
  hasta?: string;
  sucursalId?: string;
  empleadoId?: string;
}

interface ResolverQuery {
  accion?: string;
}

interface ExportQuery {
  desde?: string;
  hasta?: string;
}

export const asistenciaRouter = Router();

asistenciaRouter.get(
  "/asistencia",
  requireAuth,
  requireOrg,
  async (req: Request<Record<string, never>, unknown, unknown, ListQuery>, res: Response) => {
    const { desde, hasta, sucursalId, empleadoId } = req.query;
    const data = await listAsistencia(req.org!.id, {
      desde: desde || hoyAR(),
      hasta: hasta || hoyAR(),
      sucursalId,
      empleadoId,
    });
    res.json(data);
  }
);

asistenciaRouter.delete(
  "/asistencia/:id",
  requireAuth,
  requireOrg,
  async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    await deleteAsistencia(req.org!.id, id);
    res.json({ ok: true });
  }
);

asistenciaRouter.get(
  "/asistencia/rechazadas",
  requireAuth,
  requireOrg,
  async (req, res) => {
    const data = await listRechazadas(req.org!.id);
    res.json(data);
  }
);

asistenciaRouter.post(
  "/asistencia/rechazadas/:id",
  requireAuth,
  requireOrg,
  async (req: Request<{ id: string }, unknown, unknown, ResolverQuery>, res: Response) => {
    const { id } = req.params;
    const { accion } = req.query;
    try {
      if (accion === "aprobar") {
        await aprobarRechazada(req.org!.id, id);
      } else if (accion === "descartar") {
        await descartarRechazada(req.org!.id, id);
      } else {
        res.status(400).json({ error: "Acción inválida" });
        return;
      }
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : "No se pudo resolver el intento",
      });
      return;
    }
    res.json({ ok: true });
  }
);

asistenciaRouter.get(
  "/asistencia/export",
  requireAuth,
  requireOrg,
  async (req: Request<Record<string, never>, unknown, unknown, ExportQuery>, res: Response) => {
    const desde = req.query.desde || hoyAR();
    const hasta = req.query.hasta || hoyAR();

    const [registros, rechazadas] = await Promise.all([
      listAsistencia(req.org!.id, { desde, hasta }),
      listRechazadas(req.org!.id),
    ]);

    const buffer = await generarExcel([
      {
        nombre: "Registros",
        columnas: [
          { header: "Fecha y hora", key: "fecha", width: 20 },
          { header: "Empleado", key: "empleado", width: 26 },
          { header: "Sucursal", key: "sucursal", width: 22 },
          { header: "Tipo", key: "tipo", width: 12 },
        ],
        filas: registros.map((r) => ({
          fecha: fechaHoraAR(r.created_at),
          empleado: r.empleado_nombre ?? "—",
          sucursal: r.sucursal_nombre ?? "—",
          tipo: r.tipo === "entrada" ? "Entrada" : "Salida",
        })),
      },
      {
        nombre: "Rechazadas",
        columnas: [
          { header: "Fecha", key: "fecha", width: 20 },
          { header: "Empleado", key: "empleado", width: 26 },
          { header: "Sucursal", key: "sucursal", width: 22 },
          { header: "Tipo", key: "tipo", width: 12 },
          { header: "Motivo", key: "motivo", width: 32 },
          { header: "Distancia (m)", key: "distancia", width: 14 },
          { header: "Resuelto", key: "resuelto", width: 12 },
        ],
        filas: rechazadas.map((r) => ({
          fecha: fechaHoraAR(r.created_at),
          empleado: r.empleado_nombre ?? "—",
          sucursal: r.sucursal_nombre ?? "—",
          tipo: r.tipo === "entrada" ? "Entrada" : r.tipo === "salida" ? "Salida" : "—",
          motivo: MOTIVOS[r.motivo] ?? r.motivo,
          distancia: r.distancia_metros ?? "—",
          resuelto: r.resuelto ? "Sí" : "No",
        })),
      },
    ]);

    enviarExcel(res, buffer, `asistencia_${desde}_${hasta}.xlsx`);
  }
);
