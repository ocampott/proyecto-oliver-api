// Cálculo puro de ausencias inferidas — sin DB, sin env. Mismo patrón que
// cumplimiento-calculo.ts/horas-calculo.ts (spec §2.2): cada archivo de
// cálculo puro es autocontenido, con sus propios helpers de hora AR.
//
// Puerto de calcularAusencias del repo de referencia (single-tenant): para
// cada día del rango y cada horario pactado ese día de semana, si ningún
// turno lo cubrió (ver `horario_id` en CumplimientoRow, cumplimiento-calculo.ts)
// es una ausencia; es "justificada" si la fecha cae dentro de un rango ya
// cargado en `ausencias` (admin o autoreportada por el empleado vía chat)
// para ese empleado.

import type { CumplimientoRow, HorarioParaMatch } from "./cumplimiento-calculo.js";

const AR_OFFSET_MIN = 3 * 60;

function aHoraAR(iso: string): Date {
  return new Date(new Date(iso).getTime() - AR_OFFSET_MIN * 60000);
}

function minutosDelDia(iso: string): number {
  const d = aHoraAR(iso);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function fechaAR(iso: string): string {
  return aHoraAR(iso).toISOString().slice(0, 10);
}

function horaAMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

function addDiasISO(fechaISO: string, dias: number): string {
  const d = new Date(`${fechaISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function duracionHorarioHoras(horaInicio: string, horaFin: string): number {
  const inicio = horaAMinutos(horaInicio);
  let fin = horaAMinutos(horaFin);
  if (fin <= inicio) fin += 1440; // turno nocturno
  return (fin - inicio) / 60;
}

export interface AusenciaInferida {
  empleado_id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  horas: number;
  justificada: boolean;
}

export function calcularAusenciasPuro(
  filters: { desde: string; hasta: string },
  horarios: (HorarioParaMatch & { id: string })[],
  cumplimiento: CumplimientoRow[],
  rangosPorEmpleado: Map<string, { fecha_desde: string; fecha_hasta: string }[]>,
  ahoraISO: string
): AusenciaInferida[] {
  const cubiertos = new Set(
    cumplimiento.filter((c) => c.horario_id !== null).map((c) => `${c.empleado_id}|${c.horario_id}|${c.fecha}`)
  );

  function esJustificada(empleadoId: string, fecha: string): boolean {
    const rangos = rangosPorEmpleado.get(empleadoId);
    return !!rangos?.some((r) => fecha >= r.fecha_desde && fecha <= r.fecha_hasta);
  }

  // No contar como ausencia un turno de HOY que todavía no arrancó — si no,
  // liquidación mal marca "faltó" a alguien cuyo turno es más tarde en el día.
  const hoyAR = fechaAR(ahoraISO);
  const minutosAhoraAR = minutosDelDia(ahoraISO);

  const resultado: AusenciaInferida[] = [];
  for (let fecha = filters.desde; fecha <= filters.hasta; fecha = addDiasISO(fecha, 1)) {
    if (fecha > hoyAR) break;
    const dia = new Date(`${fecha}T00:00:00Z`).getUTCDay();
    for (const h of horarios) {
      if (h.dia_semana !== dia) continue;
      if (fecha === hoyAR && horaAMinutos(h.hora_inicio) > minutosAhoraAR) continue;
      const key = `${h.empleado_id}|${h.id}|${fecha}`;
      if (cubiertos.has(key)) continue;
      resultado.push({
        empleado_id: h.empleado_id,
        fecha,
        hora_inicio: h.hora_inicio,
        hora_fin: h.hora_fin,
        horas: duracionHorarioHoras(h.hora_inicio, h.hora_fin),
        justificada: esJustificada(h.empleado_id, fecha),
      });
    }
  }
  return resultado;
}
