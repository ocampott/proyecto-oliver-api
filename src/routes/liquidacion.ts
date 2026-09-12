import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireOrg } from "../middleware/require-org.js";
import { requireModulo } from "../middleware/require-modulo.js";
import { requireRole } from "../middleware/require-role.js";
import { calcularLiquidacion } from "../lib/liquidacion.js";
import { generarExcel, enviarExcel } from "../lib/excel.js";

function hoyISO(): string {
  return new Date().toLocaleDateString("sv", { timeZone: "America/Argentina/Buenos_Aires" });
}

function inicioDeMesISO(): string {
  return `${hoyISO().slice(0, 7)}-01`;
}

interface Query {
  desde?: string;
  hasta?: string;
  empleadoIds?: string;
}

function parseFilters(query: Query): { desde: string; hasta: string; empleadoIds?: string[] } {
  return {
    desde: query.desde ?? inicioDeMesISO(),
    hasta: query.hasta ?? hoyISO(),
    empleadoIds: query.empleadoIds?.split(",").filter(Boolean),
  };
}

export const liquidacionRouter = Router();

liquidacionRouter.get(
  "/liquidacion",
  requireAuth,
  requireOrg,
  requireModulo("rrhh"),
  requireRole("owner", "admin"),
  async (req: Request<Record<string, never>, unknown, unknown, Query>, res: Response) => {
    const filters = parseFilters(req.query);
    const filas = await calcularLiquidacion(req.org!.id, filters);
    res.json({ desde: filters.desde, hasta: filters.hasta, filas });
  }
);

liquidacionRouter.get(
  "/liquidacion/export",
  requireAuth,
  requireOrg,
  requireModulo("rrhh"),
  requireRole("owner", "admin"),
  async (req: Request<Record<string, never>, unknown, unknown, Query>, res: Response) => {
    const filters = parseFilters(req.query);
    const filas = await calcularLiquidacion(req.org!.id, filters);

    const buffer = await generarExcel([
      {
        nombre: "Liquidación",
        columnas: [
          { header: "Empleado", key: "nombre", width: 28 },
          { header: "Tipo de pago", key: "tipo_pago", width: 14 },
          { header: "Base", key: "base", width: 14 },
          { header: "Horas trabajadas", key: "horas_trabajadas", width: 16 },
          { header: "Horas pactadas", key: "horas_pactadas", width: 16 },
          { header: "Minutos perdidos", key: "minutos_perdidos", width: 16 },
          { header: "Descuento tardanza", key: "descuento_tardanza", width: 18 },
          { header: "Días ausencia (sin aviso)", key: "dias_ausencia", width: 22 },
          { header: "Descuento ausencias", key: "descuento_ausencia", width: 18 },
          { header: "Días ausencia justificada", key: "dias_ausencia_justificada", width: 24 },
          { header: "Días trabajados (jornal)", key: "dias_trabajados", width: 22 },
          { header: "Horas extra", key: "horas_extra", width: 14 },
          { header: "Según horas trabajadas", key: "total_por_horas", width: 20 },
          { header: "Adelantos", key: "adelantos", width: 14 },
          { header: "Total", key: "total", width: 16 },
          { header: "Alertas", key: "advertencias", width: 32 },
        ],
        filas: filas.map((f) => ({
          nombre: f.nombre,
          tipo_pago:
            f.tipo_pago === "mensual" ? "Mensual" : f.tipo_pago === "hora" ? "Por hora" : f.tipo_pago === "dia" ? "Por día" : "Sin definir",
          base:
            f.tipo_pago === "mensual" ? f.sueldo_mensual ?? "" : f.tipo_pago === "hora" ? f.valor_hora ?? "" : f.tipo_pago === "dia" ? f.valor_dia ?? "" : "",
          horas_trabajadas: f.horas_trabajadas !== null ? Number(f.horas_trabajadas.toFixed(2)) : "",
          horas_pactadas: f.horas_pactadas !== null ? Number(f.horas_pactadas.toFixed(2)) : "",
          minutos_perdidos: f.tipo_pago === "mensual" ? f.minutos_perdidos : "",
          descuento_tardanza: f.tipo_pago === "mensual" ? Number(f.descuento_tardanza.toFixed(2)) : "",
          dias_ausencia: f.tipo_pago === "mensual" || f.tipo_pago === "dia" ? f.dias_ausencia : "",
          descuento_ausencia: f.tipo_pago === "mensual" ? Number(f.descuento_ausencia.toFixed(2)) : "",
          dias_ausencia_justificada: f.tipo_pago === "mensual" || f.tipo_pago === "dia" ? f.dias_ausencia_justificada : "",
          dias_trabajados: f.dias_trabajados ?? "",
          horas_extra: f.horas_extra !== null ? Number(f.horas_extra.toFixed(2)) : "",
          total_por_horas: f.total_por_horas !== null ? Number(f.total_por_horas.toFixed(2)) : "",
          adelantos: f.adelantos > 0 ? Number(f.adelantos.toFixed(2)) : "",
          total: Number(f.total.toFixed(2)),
          advertencias: f.advertencias.join(" · "),
        })),
      },
    ]);

    enviarExcel(res, buffer, `liquidacion_${filters.desde}_a_${filters.hasta}.xlsx`);
  }
);
