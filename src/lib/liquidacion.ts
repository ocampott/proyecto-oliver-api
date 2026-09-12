import { listEmpleados, nombreCompleto } from "./empleados.js";
import { calcularHoras } from "./asistencia.js";
import { getTolerancia, listHorarios, listTurnosPuntuales, turnoPuntualComoHorario } from "./turnos.js";
import { listAusencias } from "./rrhh.js";
import { listAdelantos } from "./adelantos.js";
import { calcularCumplimientoPuro, type HorarioParaMatch } from "./cumplimiento-calculo.js";
import { calcularAusenciasPuro } from "./ausencias-calculo.js";
import { calcularLiquidacionPuro, type LiquidacionEmpleado, type EmpleadoParaLiquidacion, type HorarioParaLiquidacion } from "./liquidacion-calculo.js";

export type { LiquidacionEmpleado };

const ESTADOS_OPERATIVOS = ["activo", "de_licencia"];

export async function calcularLiquidacion(
  orgId: string,
  filters: { desde: string; hasta: string; empleadoIds?: string[] }
): Promise<LiquidacionEmpleado[]> {
  // Cada fuente se lee una sola vez; no repetir calcularHoras/horarios
  // a través de calcularCumplimiento y calcularAusencias anidados.
  const [empleadosTodos, turnos, horariosRecurrentes, puntuales, tolerancia, solicitudes, adelantos] = await Promise.all([
    listEmpleados(orgId, false),
    calcularHoras(orgId, { desde: filters.desde, hasta: filters.hasta }),
    listHorarios(orgId),
    listTurnosPuntuales(orgId, { desde: filters.desde, hasta: filters.hasta }),
    getTolerancia(orgId),
    listAusencias(orgId, filters),
    listAdelantos(orgId, { desde: filters.desde, hasta: filters.hasta }),
  ]);

  // Turnos puntuales se suman al horario semanal (no lo reemplazan) tanto
  // para matchear cumplimiento/ausencias (por fecha exacta) como para el
  // cálculo de horas pactadas en liquidación.
  const horariosParaMatch: (HorarioParaMatch & { id: string })[] = [
    ...horariosRecurrentes,
    ...puntuales.map((p) => turnoPuntualComoHorario(p) as HorarioParaMatch & { id: string }),
  ];
  const cumplimiento = calcularCumplimientoPuro(turnos, horariosParaMatch, tolerancia);
  const rangos = new Map<string, { fecha_desde: string; fecha_hasta: string }[]>();
  for (const a of solicitudes.filter((a) => a.estado === "aprobada")) {
    const grupo = rangos.get(a.empleado_id) ?? [];
    grupo.push({ fecha_desde: a.fecha_desde, fecha_hasta: a.fecha_hasta });
    rangos.set(a.empleado_id, grupo);
  }
  const ausencias = calcularAusenciasPuro(filters, horariosParaMatch, cumplimiento, rangos, new Date().toISOString());

  const horariosParaLiquidacion: HorarioParaLiquidacion[] = [
    ...horariosRecurrentes,
    ...puntuales.map((p) => ({
      empleado_id: p.empleado_id,
      dia_semana: new Date(`${p.fecha}T00:00:00Z`).getUTCDay(),
      hora_inicio: p.hora_inicio,
      hora_fin: p.hora_fin,
      fecha: p.fecha,
    })),
  ];

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

  return calcularLiquidacionPuro(
    filters,
    empleados,
    turnos,
    cumplimiento,
    ausencias,
    horariosParaLiquidacion,
    adelantos.map((a) => ({ empleado_id: a.empleado_id, monto: a.monto }))
  );
}
