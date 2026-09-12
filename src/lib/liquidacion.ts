import { listEmpleados, nombreCompleto } from "./empleados.js";
import { calcularHoras } from "./asistencia.js";
import { calcularCumplimiento, calcularAusencias, listHorarios, listTurnosPuntuales } from "./turnos.js";
import { listAdelantos } from "./adelantos.js";
import { calcularLiquidacionPuro, type LiquidacionEmpleado, type EmpleadoParaLiquidacion, type HorarioParaLiquidacion } from "./liquidacion-calculo.js";

export type { LiquidacionEmpleado };

const ESTADOS_OPERATIVOS = ["activo", "de_licencia"];

export async function calcularLiquidacion(
  orgId: string,
  filters: { desde: string; hasta: string; empleadoIds?: string[] }
): Promise<LiquidacionEmpleado[]> {
  const [empleadosTodos, turnos, cumplimiento, ausencias, horariosRecurrentes, puntuales, adelantos] = await Promise.all([
    listEmpleados(orgId),
    calcularHoras(orgId, { desde: filters.desde, hasta: filters.hasta }),
    calcularCumplimiento(orgId, { desde: filters.desde, hasta: filters.hasta }),
    calcularAusencias(orgId, { desde: filters.desde, hasta: filters.hasta }),
    listHorarios(orgId),
    listTurnosPuntuales(orgId, { desde: filters.desde, hasta: filters.hasta }),
    listAdelantos(orgId, { desde: filters.desde, hasta: filters.hasta }),
  ]);

  const horarios: HorarioParaLiquidacion[] = [
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
    horarios,
    adelantos.map((a) => ({ empleado_id: a.empleado_id, monto: a.monto }))
  );
}
