// Cálculo puro de cumplimiento de horarios — sin DB, sin env. Separado de
// turnos.ts para poder testearlo sin depender de Supabase (spec §2.2).
//
// Todo el cálculo de hora/día usa el mismo offset fijo AR (-03:00, sin
// horario de verano) que horas-calculo.ts — nunca la TZ del sistema
// operativo.

import type { Turno } from "./horas-calculo.js";

const AR_OFFSET_MIN = 3 * 60;

function aHoraAR(iso: string): Date {
  return new Date(new Date(iso).getTime() - AR_OFFSET_MIN * 60000);
}

function minutosDelDia(iso: string): number {
  const d = aHoraAR(iso);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function diaSemanaAR(iso: string): number {
  return aHoraAR(iso).getUTCDay();
}

function fechaAR(iso: string): string {
  return aHoraAR(iso).toISOString().slice(0, 10);
}

function horaAMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

export interface HorarioParaMatch {
  empleado_id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  tolerancia_min: number | null;
}

export interface CumplimientoRow {
  empleado_id: string;
  nombre: string;
  sucursal_nombre: string;
  fecha: string;
  entrada_real: string;
  entrada_esperada: string | null;
  diff_entrada_min: number | null;
  salida_real: string | null;
  salida_esperada: string | null;
  diff_salida_min: number | null;
  en_curso: boolean;
  estado: "a_horario" | "tarde" | "salida_anticipada" | "tarde_y_anticipada" | "sin_horario";
  tolerancia_aplicada: number | null;
}

/**
 * Compara cada turno real (ya emparejado, ver horas-calculo.ts) contra el
 * horario esperado del empleado ese día de semana, con tolerancia en
 * minutos (particular de la franja si está definida, si no la general de la
 * org).
 */
export function calcularCumplimientoPuro(
  turnosTodos: Turno[],
  horarios: HorarioParaMatch[],
  toleranciaGeneral: number,
  empleadoIdFilter?: string
): CumplimientoRow[] {
  const turnos = empleadoIdFilter ? turnosTodos.filter((t) => t.empleado_id === empleadoIdFilter) : turnosTodos;

  return turnos.map((t): CumplimientoRow => {
    const dia = diaSemanaAR(t.entrada_at);
    const diaAnterior = (dia + 6) % 7;
    const entradaMin = minutosDelDia(t.entrada_at);

    // Turnos nocturnos (hora_fin <= hora_inicio, ej. 22:00→06:00) se cargan
    // bajo el día en que ARRANCAN. Si el empleado marca después de
    // medianoche, la entrada cae del lado de "hoy" en el calendario — para
    // poder emparejarla con el turno nocturno de "ayer" se suman 1440 min
    // al comparar, y se toma el candidato (de hoy o de ayer) más cercano.
    const candidatosHoy = horarios
      .filter((h) => h.empleado_id === t.empleado_id && h.dia_semana === dia)
      .map((h) => ({ h, diff: entradaMin - horaAMinutos(h.hora_inicio) }));
    const candidatosAyerNocturno = horarios
      .filter(
        (h) =>
          h.empleado_id === t.empleado_id &&
          h.dia_semana === diaAnterior &&
          horaAMinutos(h.hora_fin) <= horaAMinutos(h.hora_inicio)
      )
      .map((h) => ({ h, diff: entradaMin + 1440 - horaAMinutos(h.hora_inicio) }));
    const candidatos = [...candidatosHoy, ...candidatosAyerNocturno];

    if (candidatos.length === 0) {
      return {
        empleado_id: t.empleado_id,
        nombre: t.nombre,
        sucursal_nombre: t.sucursal_nombre,
        fecha: fechaAR(t.entrada_at),
        entrada_real: t.entrada_at,
        entrada_esperada: null,
        diff_entrada_min: null,
        salida_real: t.salida_at,
        salida_esperada: null,
        diff_salida_min: null,
        en_curso: t.salida_at === null,
        estado: "sin_horario",
        tolerancia_aplicada: null,
      };
    }

    const mejor = candidatos.reduce((mejor, c) => (Math.abs(c.diff) < Math.abs(mejor.diff) ? c : mejor));
    const horario = mejor.h;
    const tolerancia = horario.tolerancia_min ?? toleranciaGeneral;
    const diffEntrada = mejor.diff;
    const tarde = diffEntrada > tolerancia;

    let diffSalida: number | null = null;
    let anticipada = false;
    if (t.salida_at !== null) {
      const salidaMin = minutosDelDia(t.salida_at);
      diffSalida = horaAMinutos(horario.hora_fin) - salidaMin;
      anticipada = diffSalida > tolerancia;
    }

    const estado: CumplimientoRow["estado"] =
      tarde && anticipada ? "tarde_y_anticipada" : tarde ? "tarde" : anticipada ? "salida_anticipada" : "a_horario";

    return {
      empleado_id: t.empleado_id,
      nombre: t.nombre,
      sucursal_nombre: t.sucursal_nombre,
      fecha: fechaAR(t.entrada_at),
      entrada_real: t.entrada_at,
      entrada_esperada: horario.hora_inicio,
      diff_entrada_min: diffEntrada,
      salida_real: t.salida_at,
      salida_esperada: horario.hora_fin,
      diff_salida_min: diffSalida,
      en_curso: t.salida_at === null,
      estado,
      tolerancia_aplicada: tolerancia,
    };
  });
}
