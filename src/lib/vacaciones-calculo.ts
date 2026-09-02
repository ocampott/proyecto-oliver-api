// Cálculo puro de saldo de vacaciones — sin DB, sin env. Mismo patrón que
// el resto de los archivos *-calculo.ts.
//
// Puerto de calcularSaldoVacaciones del repo de referencia: aproximado
// según la Ley de Contrato de Trabajo argentina (art. 150): días asignados
// por año según antigüedad al 31/12 de ese año, menos los días ya usados
// (ausencias con motivo "Vacaciones" que caen en el año). No reemplaza un
// cálculo legal formal — es una referencia rápida para RRHH.

export interface EmpleadoParaVacaciones {
  id: string;
  nombre: string;
  fecha_ingreso: string | null;
}

export interface AusenciaVacacionRango {
  empleado_id: string;
  fecha_desde: string;
  fecha_hasta: string;
}

export interface SaldoVacacionesEmpleado {
  empleado_id: string;
  nombre: string;
  fecha_ingreso: string | null;
  antiguedad_anios: number | null;
  dias_asignados: number | null;
  dias_usados: number;
  saldo: number | null;
  advertencia: string | null;
}

function añosCompletos(desdeISO: string, hastaISO: string): number {
  const d1 = new Date(`${desdeISO}T00:00:00Z`);
  const d2 = new Date(`${hastaISO}T00:00:00Z`);
  let anios = d2.getUTCFullYear() - d1.getUTCFullYear();
  const cumplioAniversario =
    d2.getUTCMonth() > d1.getUTCMonth() || (d2.getUTCMonth() === d1.getUTCMonth() && d2.getUTCDate() >= d1.getUTCDate());
  if (!cumplioAniversario) anios -= 1;
  return Math.max(0, anios);
}

function diasVacacionesLey(antiguedadAnios: number): number {
  if (antiguedadAnios >= 20) return 35;
  if (antiguedadAnios >= 10) return 28;
  if (antiguedadAnios >= 5) return 21;
  return 14;
}

function diasEntreISO(desdeISO: string, hastaISO: string): number {
  return Math.round((Date.parse(`${hastaISO}T00:00:00Z`) - Date.parse(`${desdeISO}T00:00:00Z`)) / 86400000) + 1;
}

export function calcularSaldoVacacionesPuro(
  anioObjetivo: number,
  empleados: EmpleadoParaVacaciones[],
  vacacionesRows: AusenciaVacacionRango[]
): SaldoVacacionesEmpleado[] {
  const inicioAnio = `${anioObjetivo}-01-01`;
  const finAnio = `${anioObjetivo}-12-31`;

  const usadosPorEmpleado = new Map<string, number>();
  for (const r of vacacionesRows) {
    const desdeClip = r.fecha_desde < inicioAnio ? inicioAnio : r.fecha_desde;
    const hastaClip = r.fecha_hasta > finAnio ? finAnio : r.fecha_hasta;
    usadosPorEmpleado.set(r.empleado_id, (usadosPorEmpleado.get(r.empleado_id) ?? 0) + diasEntreISO(desdeClip, hastaClip));
  }

  return empleados.map((emp): SaldoVacacionesEmpleado => {
    const diasUsados = usadosPorEmpleado.get(emp.id) ?? 0;

    if (!emp.fecha_ingreso) {
      return {
        empleado_id: emp.id,
        nombre: emp.nombre,
        fecha_ingreso: null,
        antiguedad_anios: null,
        dias_asignados: null,
        dias_usados: diasUsados,
        saldo: null,
        advertencia: "Sin fecha de ingreso configurada",
      };
    }

    if (emp.fecha_ingreso > finAnio) {
      return {
        empleado_id: emp.id,
        nombre: emp.nombre,
        fecha_ingreso: emp.fecha_ingreso,
        antiguedad_anios: 0,
        dias_asignados: 0,
        dias_usados: diasUsados,
        saldo: -diasUsados,
        advertencia: null,
      };
    }

    const ingresoEnEsteAnio = emp.fecha_ingreso.slice(0, 4) === String(anioObjetivo);
    let antiguedadAnios: number;
    let diasAsignados: number;
    if (ingresoEnEsteAnio) {
      // Primer año: proporcional, 1 día cada 20 trabajados (LCT art. 153).
      antiguedadAnios = 0;
      diasAsignados = Math.floor(diasEntreISO(emp.fecha_ingreso, finAnio) / 20);
    } else {
      antiguedadAnios = añosCompletos(emp.fecha_ingreso, finAnio);
      diasAsignados = diasVacacionesLey(antiguedadAnios);
    }

    return {
      empleado_id: emp.id,
      nombre: emp.nombre,
      fecha_ingreso: emp.fecha_ingreso,
      antiguedad_anios: antiguedadAnios,
      dias_asignados: diasAsignados,
      dias_usados: diasUsados,
      saldo: diasAsignados - diasUsados,
      advertencia: null,
    };
  });
}
