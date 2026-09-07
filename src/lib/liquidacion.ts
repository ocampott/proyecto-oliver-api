import { listEmpleados, nombreCompleto } from "./empleados.js";
import { calcularHoras } from "./asistencia.js";
import { getTolerancia, listHorarios } from "./turnos.js";
import { listAusencias } from "./rrhh.js";
import { calcularCumplimientoPuro } from "./cumplimiento-calculo.js";
import { calcularAusenciasPuro } from "./ausencias-calculo.js";
import { calcularLiquidacionPuro, type LiquidacionEmpleado, type EmpleadoParaLiquidacion } from "./liquidacion-calculo.js";

export type { LiquidacionEmpleado };

const ESTADOS_OPERATIVOS = ["activo", "de_licencia"];

export async function calcularLiquidacion(
  orgId: string,
  filters: { desde: string; hasta: string; empleadoIds?: string[] }
): Promise<LiquidacionEmpleado[]> {
  // Cada fuente se lee una sola vez; no repetir calcularHoras/horarios
  // a través de calcularCumplimiento y calcularAusencias anidados.
  const [empleadosTodos, turnos, horarios, tolerancia, solicitudes] = await Promise.all([
    listEmpleados(orgId, false),
    calcularHoras(orgId, { desde: filters.desde, hasta: filters.hasta }),
    listHorarios(orgId),
    getTolerancia(orgId),
    listAusencias(orgId, filters),
  ]);
  const cumplimiento = calcularCumplimientoPuro(turnos, horarios, tolerancia);
  const rangos = new Map<string, { fecha_desde: string; fecha_hasta: string }[]>();
  for (const a of solicitudes.filter((a) => a.estado === "aprobada")) {
    const grupo = rangos.get(a.empleado_id) ?? [];
    grupo.push({ fecha_desde: a.fecha_desde, fecha_hasta: a.fecha_hasta });
    rangos.set(a.empleado_id, grupo);
  }
  const ausencias = calcularAusenciasPuro(filters, horarios, cumplimiento, rangos, new Date().toISOString());

  const empleados: EmpleadoParaLiquidacion[] = empleadosTodos
    .filter(
      (e) =>
        ESTADOS_OPERATIVOS.includes(e.estado) &&
        (!filters.empleadoIds || filters.empleadoIds.length === 0 || filters.empleadoIds.includes(e.id))
    )
    .map((e) => ({
      id: e.id,
      nombre: nombreCompleto(e),
      tipo_pago: e.tipo_pago,
      sueldo_mensual: e.sueldo_mensual,
      valor_hora: e.valor_hora,
      valor_dia: e.valor_dia,
    }));

  return calcularLiquidacionPuro(filters, empleados, turnos, cumplimiento, ausencias, horarios);
}
