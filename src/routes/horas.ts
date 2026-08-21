import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireOrg } from "../middleware/require-org.js";
import { requireModulo } from "../middleware/require-modulo.js";
import { calcularHoras, calcularResumenHoras } from "../lib/asistencia.js";
import { generarExcel, enviarExcel } from "../lib/excel.js";

const AR_TZ = "America/Argentina/Buenos_Aires";

function hoyAR(): string {
  return new Date().toLocaleDateString("sv", { timeZone: AR_TZ });
}

function inicioDeMesAR(): string {
  return `${hoyAR().slice(0, 7)}-01`;
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

interface HorasQuery {
  desde?: string;
  hasta?: string;
  sucursalId?: string;
}

interface ExportQuery {
  desde?: string;
  hasta?: string;
}

export const horasRouter = Router();

horasRouter.get(
  "/horas",
  requireAuth,
  requireOrg,
  requireModulo("horas"),
  async (req: Request<Record<string, never>, unknown, unknown, HorasQuery>, res: Response) => {
    const { sucursalId } = req.query;
    const desde = req.query.desde || inicioDeMesAR();
    const hasta = req.query.hasta || hoyAR();

    const turnos = await calcularHoras(req.org!.id, { desde, hasta, sucursalId });
    const resumen = calcularResumenHoras(turnos);

    res.json({ desde, hasta, turnos, resumen });
  }
);

horasRouter.get(
  "/horas/export",
  requireAuth,
  requireOrg,
  requireModulo("horas"),
  async (req: Request<Record<string, never>, unknown, unknown, ExportQuery>, res: Response) => {
    const desde = req.query.desde || inicioDeMesAR();
    const hasta = req.query.hasta || hoyAR();

    const turnos = await calcularHoras(req.org!.id, { desde, hasta });
    const resumen = calcularResumenHoras(turnos);

    const buffer = await generarExcel([
      {
        nombre: "Resumen",
        columnas: [
          { header: "Empleado", key: "empleado", width: 26 },
          { header: "Total horas", key: "total", width: 14 },
          { header: "Estado", key: "estado", width: 18 },
        ],
        filas: resumen.map((r) => ({
          empleado: r.nombre,
          total: r.totalHoras,
          estado: r.enCurso ? "Turno en curso" : "—",
        })),
      },
      {
        nombre: "Turnos",
        columnas: [
          { header: "Empleado", key: "empleado", width: 26 },
          { header: "Sucursal", key: "sucursal", width: 22 },
          { header: "Entrada", key: "entrada", width: 20 },
          { header: "Salida", key: "salida", width: 20 },
          { header: "Horas", key: "horas", width: 12 },
        ],
        filas: turnos.map((t) => ({
          empleado: t.nombre,
          sucursal: t.sucursal_nombre,
          entrada: fechaHoraAR(t.entrada_at),
          salida: t.salida_at ? fechaHoraAR(t.salida_at) : "En curso",
          horas: t.horas ?? "—",
        })),
      },
    ]);

    enviarExcel(res, buffer, `horas_${desde}_${hasta}.xlsx`);
  }
);
