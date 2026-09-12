// Cálculo puro de liquidación de sueldos — sin DB, sin env. Mismo patrón
// que cumplimiento-calculo.ts/horas-calculo.ts/ausencias-calculo.ts.
//
// Puerto de calcularLiquidacion del repo de referencia (single-tenant):
// cálculo interno aproximado (no reemplaza un recibo de sueldo legal — sin
// aportes/ganancias/SAC). "hora" cobra las horas efectivamente trabajadas.
// "mensual" cobra el fijo, con descuentos proporcionales por tardanzas/
// salidas anticipadas y por ausencias sin aviso, traducidos a dinero con un
// valor-hora equivalente = sueldo_mensual / horas pactadas en el período.
// "dia" cobra un jornal por cada día trabajado que coincide con un horario
// pactado, más las horas que excedan ese horario ese día, a valor hora.

import type { Turno } from "./horas-calculo.js";
import type { CumplimientoRow } from "./cumplimiento-calculo.js";
import type { AusenciaInferida } from "./ausencias-calculo.js";

export type TipoPago = "mensual" | "hora" | "dia";

export interface EmpleadoParaLiquidacion {
  id: string;
  nombre: string;
  tipo_pago: TipoPago | null;
  sueldo_mensual: number | null;
  valor_hora: number | null;
  valor_dia: number | null;
}

export interface HorarioParaLiquidacion {
  empleado_id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  /** Si está seteado, es un turno puntual: cuenta una sola vez en esa fecha
   * exacta (ya vino filtrado al período) en vez de repetirse cada semana. */
  fecha?: string;
}

export interface AdelantoParaLiquidacion {
  empleado_id: string;
  monto: number;
}

export interface LiquidacionEmpleado {
  empleado_id: string;
  nombre: string;
  tipo_pago: TipoPago | null;
  sueldo_mensual: number | null;
  valor_hora: number | null;
  valor_dia: number | null;
  horas_trabajadas: number | null;
  horas_en_curso: boolean;
  horas_pactadas: number | null;
  valor_hora_equivalente: number | null;
  minutos_perdidos: number;
  descuento_tardanza: number;
  dias_ausencia: number;
  horas_ausencia: number;
  descuento_ausencia: number;
  dias_ausencia_justificada: number;
  horas_ausencia_justificada: number;
  dias_trabajados: number | null;
  horas_extra: number | null;
  total_por_horas: number | null;
  /** Suma de adelantos del período — ya restados de `total`. */
  adelantos: number;
  total: number;
  advertencias: string[];
}

function horaAMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

function duracionHorarioHoras(horaInicio: string, horaFin: string): number {
  const inicio = horaAMinutos(horaInicio);
  let fin = horaAMinutos(horaFin);
  if (fin <= inicio) fin += 1440; // turno nocturno
  return (fin - inicio) / 60;
}

function addDiasISO(fechaISO: string, dias: number): string {
  const d = new Date(`${fechaISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function contarOcurrenciasDia(desde: string, hasta: string, diaSemana: number): number {
  let count = 0;
  for (let fecha = desde; fecha <= hasta; fecha = addDiasISO(fecha, 1)) {
    if (new Date(`${fecha}T00:00:00Z`).getUTCDay() === diaSemana) count++;
  }
  return count;
}

const AR_OFFSET_MIN = 3 * 60;
function fechaDeISO(iso: string): string {
  return new Date(new Date(iso).getTime() - AR_OFFSET_MIN * 60000).toISOString().slice(0, 10);
}

function formatARSSimple(n: number): string {
  return `$${Math.round(n).toLocaleString("es-AR")}`;
}

function diasUnicos(rows: { fecha: string }[]): number {
  return new Set(rows.map((r) => r.fecha)).size;
}

// Compara el total ya calculado (sueldo fijo mensual, o jornal por día)
// contra lo que cobraría si se le pagara estrictamente por horas trabajadas
// × valor_hora — advierte si hay diferencia, para que el admin vea rápido
// si el sueldo fijo está pagando de más o de menos.
function compararConValorHora(
  total: number,
  horasTrabajadas: number,
  valorHora: number | null,
  advertencias: string[]
): number | null {
  if (!valorHora) return null;
  const totalPorHoras = horasTrabajadas * valorHora;
  const diff = total - totalPorHoras;
  if (Math.abs(diff) > 1) {
    advertencias.push(
      diff > 0
        ? `Cobra ${formatARSSimple(diff)} más que si se le pagara por hora trabajada (equivaldría a ${formatARSSimple(totalPorHoras)})`
        : `Cobra ${formatARSSimple(Math.abs(diff))} menos que si se le pagara por hora trabajada (equivaldría a ${formatARSSimple(totalPorHoras)})`
    );
  }
  return totalPorHoras;
}

export function calcularLiquidacionPuro(
  filters: { desde: string; hasta: string },
  empleados: EmpleadoParaLiquidacion[],
  turnos: Turno[],
  cumplimiento: CumplimientoRow[],
  ausencias: AusenciaInferida[],
  horarios: HorarioParaLiquidacion[],
  adelantos: AdelantoParaLiquidacion[] = []
): LiquidacionEmpleado[] {
  const adelantosPorEmpleado = new Map<string, number>();
  for (const a of adelantos) {
    adelantosPorEmpleado.set(a.empleado_id, (adelantosPorEmpleado.get(a.empleado_id) ?? 0) + a.monto);
  }
  function adelantosDe(empleadoId: string): number {
    return adelantosPorEmpleado.get(empleadoId) ?? 0;
  }

  const turnosPorEmpleado = new Map<string, Turno[]>();
  for (const t of turnos) {
    if (!turnosPorEmpleado.has(t.empleado_id)) turnosPorEmpleado.set(t.empleado_id, []);
    turnosPorEmpleado.get(t.empleado_id)!.push(t);
  }
  const horariosPorEmpleado = new Map<string, HorarioParaLiquidacion[]>();
  for (const h of horarios) {
    if (!horariosPorEmpleado.has(h.empleado_id)) horariosPorEmpleado.set(h.empleado_id, []);
    horariosPorEmpleado.get(h.empleado_id)!.push(h);
  }
  const cumplimientoPorEmpleado = new Map<string, CumplimientoRow[]>();
  for (const c of cumplimiento) {
    if (!cumplimientoPorEmpleado.has(c.empleado_id)) cumplimientoPorEmpleado.set(c.empleado_id, []);
    cumplimientoPorEmpleado.get(c.empleado_id)!.push(c);
  }
  const ausenciasPorEmpleado = new Map<string, AusenciaInferida[]>();
  for (const a of ausencias) {
    if (!ausenciasPorEmpleado.has(a.empleado_id)) ausenciasPorEmpleado.set(a.empleado_id, []);
    ausenciasPorEmpleado.get(a.empleado_id)!.push(a);
  }

  const ocurrenciasPorDia = new Map<number, number>();
  function ocurrencias(dia: number): number {
    if (!ocurrenciasPorDia.has(dia)) {
      ocurrenciasPorDia.set(dia, contarOcurrenciasDia(filters.desde, filters.hasta, dia));
    }
    return ocurrenciasPorDia.get(dia)!;
  }

  return empleados.map((emp): LiquidacionEmpleado => {
    const advertencias: string[] = [];

    if (emp.tipo_pago === "hora") {
      const turnosEmp = turnosPorEmpleado.get(emp.id) ?? [];
      const horasTrabajadas = turnosEmp.filter((t) => t.horas !== null).reduce((acc, t) => acc + (t.horas ?? 0), 0);
      const horasEnCurso = turnosEmp.some((t) => t.horas === null);
      const adelantosEmp = adelantosDe(emp.id);
      if (!emp.valor_hora) advertencias.push("Sin valor hora configurado");
      const totalPorHoras = horasTrabajadas * (emp.valor_hora ?? 0);
      return {
        empleado_id: emp.id,
        nombre: emp.nombre,
        tipo_pago: "hora",
        sueldo_mensual: null,
        valor_hora: emp.valor_hora,
        valor_dia: null,
        horas_trabajadas: horasTrabajadas,
        horas_en_curso: horasEnCurso,
        horas_pactadas: null,
        valor_hora_equivalente: null,
        minutos_perdidos: 0,
        descuento_tardanza: 0,
        dias_ausencia: 0,
        horas_ausencia: 0,
        descuento_ausencia: 0,
        dias_ausencia_justificada: 0,
        horas_ausencia_justificada: 0,
        dias_trabajados: null,
        horas_extra: null,
        total_por_horas: totalPorHoras,
        adelantos: adelantosEmp,
        total: totalPorHoras - adelantosEmp,
        advertencias,
      };
    }

    if (emp.tipo_pago === "dia") {
      const horariosEmp = horariosPorEmpleado.get(emp.id) ?? [];
      const turnosEmp = turnosPorEmpleado.get(emp.id) ?? [];
      const turnosCerrados = turnosEmp.filter((t) => t.horas !== null);
      const horasEnCurso = turnosEmp.some((t) => t.horas === null);
      const horasTrabajadasTotal = turnosCerrados.reduce((acc, t) => acc + (t.horas ?? 0), 0);

      if (!emp.valor_dia) advertencias.push("Sin valor por día configurado");
      if (!emp.valor_hora) advertencias.push("Sin valor hora configurado (necesario para horas extra)");
      const adelantosEmp = adelantosDe(emp.id);

      if (horariosEmp.length === 0) {
        const totalPorHoras = horasTrabajadasTotal * (emp.valor_hora ?? 0);
        return {
          empleado_id: emp.id,
          nombre: emp.nombre,
          tipo_pago: "dia",
          sueldo_mensual: null,
          valor_hora: emp.valor_hora,
          valor_dia: emp.valor_dia,
          horas_trabajadas: horasTrabajadasTotal,
          horas_en_curso: horasEnCurso,
          horas_pactadas: null,
          valor_hora_equivalente: null,
          minutos_perdidos: 0,
          descuento_tardanza: 0,
          dias_ausencia: 0,
          horas_ausencia: 0,
          descuento_ausencia: 0,
          dias_ausencia_justificada: 0,
          horas_ausencia_justificada: 0,
          dias_trabajados: null,
          horas_extra: null,
          total_por_horas: totalPorHoras,
          adelantos: adelantosEmp,
          total: totalPorHoras - adelantosEmp,
          advertencias,
        };
      }

      const horasPactadasPorDiaSemana = new Map<number, number>();
      // Turno puntual en una fecha exacta (ej. "domingo por medio") pisa el
      // día de semana para ESA fecha — se paga jornal completo igual que un
      // día del patrón semanal, no directo por hora.
      const horasPactadasPorFechaPuntual = new Map<string, number>();
      for (const h of horariosEmp) {
        if (h.fecha) {
          horasPactadasPorFechaPuntual.set(
            h.fecha,
            (horasPactadasPorFechaPuntual.get(h.fecha) ?? 0) + duracionHorarioHoras(h.hora_inicio, h.hora_fin)
          );
        } else {
          horasPactadasPorDiaSemana.set(
            h.dia_semana,
            (horasPactadasPorDiaSemana.get(h.dia_semana) ?? 0) + duracionHorarioHoras(h.hora_inicio, h.hora_fin)
          );
        }
      }

      const horasPorFecha = new Map<string, number>();
      for (const t of turnosCerrados) {
        const fecha = fechaDeISO(t.entrada_at);
        horasPorFecha.set(fecha, (horasPorFecha.get(fecha) ?? 0) + (t.horas ?? 0));
      }

      let diasTrabajados = 0;
      let horasExtra = 0;
      let total = 0;
      for (const [fecha, horasDia] of horasPorFecha) {
        const diaSemana = new Date(`${fecha}T00:00:00Z`).getUTCDay();
        const horasPactadasDia = horasPactadasPorFechaPuntual.get(fecha) ?? horasPactadasPorDiaSemana.get(diaSemana) ?? 0;
        if (horasPactadasDia > 0) {
          diasTrabajados += 1;
          const extra = Math.max(0, horasDia - horasPactadasDia);
          horasExtra += extra;
          total += (emp.valor_dia ?? 0) + extra * (emp.valor_hora ?? 0);
        } else {
          total += horasDia * (emp.valor_hora ?? 0);
        }
      }

      const ausenciasEmp = ausenciasPorEmpleado.get(emp.id) ?? [];
      const ausenciasInjustificadas = ausenciasEmp.filter((a) => !a.justificada);
      const ausenciasJustificadas = ausenciasEmp.filter((a) => a.justificada);

      const totalPorHoras = compararConValorHora(total, horasTrabajadasTotal, emp.valor_hora, advertencias);

      return {
        empleado_id: emp.id,
        nombre: emp.nombre,
        tipo_pago: "dia",
        sueldo_mensual: null,
        valor_hora: emp.valor_hora,
        valor_dia: emp.valor_dia,
        horas_trabajadas: horasTrabajadasTotal,
        horas_en_curso: horasEnCurso,
        horas_pactadas: null,
        valor_hora_equivalente: null,
        minutos_perdidos: 0,
        descuento_tardanza: 0,
        dias_ausencia: diasUnicos(ausenciasInjustificadas),
        horas_ausencia: ausenciasInjustificadas.reduce((acc, a) => acc + a.horas, 0),
        descuento_ausencia: 0,
        dias_ausencia_justificada: diasUnicos(ausenciasJustificadas),
        horas_ausencia_justificada: ausenciasJustificadas.reduce((acc, a) => acc + a.horas, 0),
        dias_trabajados: diasTrabajados,
        horas_extra: horasExtra,
        total_por_horas: totalPorHoras,
        adelantos: adelantosEmp,
        total: total - adelantosEmp,
        advertencias,
      };
    }

    if (emp.tipo_pago === "mensual") {
      const horariosEmp = horariosPorEmpleado.get(emp.id) ?? [];
      // Un turno puntual (h.fecha seteado) ya viene filtrado al período —
      // cuenta 1 sola vez, no "ocurrencias por día de semana" como un
      // horario recurrente.
      const horasPactadas = horariosEmp.reduce(
        (acc, h) =>
          acc + (h.fecha ? 1 : ocurrencias(h.dia_semana)) * duracionHorarioHoras(h.hora_inicio, h.hora_fin),
        0
      );
      const valorHoraEquivalente = horasPactadas > 0 && emp.sueldo_mensual ? emp.sueldo_mensual / horasPactadas : null;

      const cRows = cumplimientoPorEmpleado.get(emp.id) ?? [];
      let minutosPerdidos = 0;
      for (const c of cRows) {
        if (c.estado === "tarde" || c.estado === "tarde_y_anticipada") minutosPerdidos += c.diff_entrada_min ?? 0;
        if (c.estado === "salida_anticipada" || c.estado === "tarde_y_anticipada") minutosPerdidos += c.diff_salida_min ?? 0;
      }
      const descuentoTardanza = valorHoraEquivalente ? (minutosPerdidos / 60) * valorHoraEquivalente : 0;

      const ausenciasEmp = ausenciasPorEmpleado.get(emp.id) ?? [];
      const ausenciasInjustificadas = ausenciasEmp.filter((a) => !a.justificada);
      const ausenciasJustificadas = ausenciasEmp.filter((a) => a.justificada);
      const horasAusencia = ausenciasInjustificadas.reduce((acc, a) => acc + a.horas, 0);
      const horasAusenciaJustificada = ausenciasJustificadas.reduce((acc, a) => acc + a.horas, 0);
      const descuentoAusencia = valorHoraEquivalente ? horasAusencia * valorHoraEquivalente : 0;

      const turnosEmp = turnosPorEmpleado.get(emp.id) ?? [];
      const horasTrabajadas = turnosEmp.filter((t) => t.horas !== null).reduce((acc, t) => acc + (t.horas ?? 0), 0);
      const horasEnCurso = turnosEmp.some((t) => t.horas === null);

      if (!emp.sueldo_mensual) advertencias.push("Sin sueldo mensual configurado");
      if (horasPactadas === 0) advertencias.push("Sin horario cargado — no se pueden calcular descuentos");
      if (!emp.valor_hora) advertencias.push("Sin valor hora configurado (no se puede comparar contra horas trabajadas)");

      const adelantosEmp = adelantosDe(emp.id);
      const totalSinAdelantos = (emp.sueldo_mensual ?? 0) - descuentoTardanza - descuentoAusencia;
      const totalPorHoras = compararConValorHora(totalSinAdelantos, horasTrabajadas, emp.valor_hora, advertencias);
      const total = totalSinAdelantos - adelantosEmp;

      return {
        empleado_id: emp.id,
        nombre: emp.nombre,
        tipo_pago: "mensual",
        sueldo_mensual: emp.sueldo_mensual,
        valor_hora: emp.valor_hora,
        valor_dia: null,
        horas_trabajadas: horasTrabajadas,
        horas_en_curso: horasEnCurso,
        horas_pactadas: horasPactadas,
        valor_hora_equivalente: valorHoraEquivalente,
        minutos_perdidos: minutosPerdidos,
        descuento_tardanza: descuentoTardanza,
        dias_ausencia: diasUnicos(ausenciasInjustificadas),
        horas_ausencia: horasAusencia,
        descuento_ausencia: descuentoAusencia,
        dias_ausencia_justificada: diasUnicos(ausenciasJustificadas),
        horas_ausencia_justificada: horasAusenciaJustificada,
        dias_trabajados: null,
        horas_extra: null,
        total_por_horas: totalPorHoras,
        adelantos: adelantosEmp,
        total,
        advertencias,
      };
    }

    advertencias.push("Sin tipo de pago configurado");
    const adelantosEmp = adelantosDe(emp.id);
    return {
      empleado_id: emp.id,
      nombre: emp.nombre,
      tipo_pago: null,
      sueldo_mensual: emp.sueldo_mensual,
      valor_hora: emp.valor_hora,
      valor_dia: emp.valor_dia,
      horas_trabajadas: null,
      horas_en_curso: false,
      horas_pactadas: null,
      valor_hora_equivalente: null,
      minutos_perdidos: 0,
      descuento_tardanza: 0,
      dias_ausencia: 0,
      horas_ausencia: 0,
      descuento_ausencia: 0,
      dias_ausencia_justificada: 0,
      horas_ausencia_justificada: 0,
      dias_trabajados: null,
      horas_extra: null,
      total_por_horas: null,
      adelantos: adelantosEmp,
      total: 0 - adelantosEmp,
      advertencias,
    };
  });
}
