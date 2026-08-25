// Cálculo puro de horas trabajadas — sin DB, sin env. Separado de asistencia.ts
// a propósito para poder testearlo sin depender de Supabase (spec §2.2/§2.1).

export type TipoMarca = "entrada" | "salida";

export interface RegistroCrudo {
  empleado_id: string;
  sucursal_id: string;
  tipo: TipoMarca;
  created_at: string;
  nombre: string;
  sucursal_nombre: string;
}

export interface Turno {
  empleado_id: string;
  nombre: string;
  sucursal_id: string;
  sucursal_nombre: string;
  entrada_at: string;
  salida_at: string | null;
  horas: number | null;
}

// Tope de duración de un turno: si la salida más cercana está más lejos que
// esto, se asume que el empleado se olvidó de marcar y el turno queda
// "abierto" en vez de generar una jornada absurda de 20+ horas (spec §2.1).
const TOPE_TURNO_HORAS = 16;

/**
 * Empareja cada "entrada" con la siguiente "salida" cronológica del mismo
 * empleado+sucursal. Salida sin entrada previa: dato huérfano, se ignora.
 * Entrada sin salida (o cuya salida está más allá del tope): turno en curso
 * (horas: null). No filtra por rango de fechas — eso lo hace el caller
 * (asistencia.ts) después de pedir con margen, ver ventanaConMargen.
 */
export function emparejarTurnos(regs: RegistroCrudo[]): Turno[] {
  const ordenados = [...regs].sort((a, b) => a.created_at.localeCompare(b.created_at));

  const porPar = new Map<string, RegistroCrudo[]>();
  for (const r of ordenados) {
    const key = `${r.empleado_id}:${r.sucursal_id}`;
    if (!porPar.has(key)) porPar.set(key, []);
    porPar.get(key)!.push(r);
  }

  const turnos: Turno[] = [];
  for (const regsDelPar of porPar.values()) {
    let pendiente: RegistroCrudo | null = null;

    const aTurno = (entrada: RegistroCrudo, salida: RegistroCrudo | null): Turno => ({
      empleado_id: entrada.empleado_id,
      nombre: entrada.nombre,
      sucursal_id: entrada.sucursal_id,
      sucursal_nombre: entrada.sucursal_nombre,
      entrada_at: entrada.created_at,
      salida_at: salida?.created_at ?? null,
      horas: salida
        ? Math.round(
            ((new Date(salida.created_at).getTime() - new Date(entrada.created_at).getTime()) / 3600000) * 100
          ) / 100
        : null,
    });

    for (const r of regsDelPar) {
      if (r.tipo === "entrada") {
        if (pendiente) turnos.push(aTurno(pendiente, null));
        pendiente = r;
        continue;
      }
      if (!pendiente) continue; // salida sin entrada previa: dato huérfano, se ignora

      const horas = (new Date(r.created_at).getTime() - new Date(pendiente.created_at).getTime()) / 3600000;
      if (horas > TOPE_TURNO_HORAS) {
        // La salida "real" está demasiado lejos como para ser de este turno
        // (típico olvido de marcar salida) — la entrada queda abierta y esta
        // salida se descarta, igual que una salida huérfana.
        turnos.push(aTurno(pendiente, null));
        pendiente = null;
      } else {
        turnos.push(aTurno(pendiente, r));
        pendiente = null;
      }
    }
    if (pendiente) turnos.push(aTurno(pendiente, null));
  }

  return turnos.sort((a, b) => a.nombre.localeCompare(b.nombre) || a.entrada_at.localeCompare(b.entrada_at));
}

export interface ResumenEmpleado {
  nombre: string;
  totalHoras: number;
  enCurso: boolean;
}

export function calcularResumenHoras(turnos: Turno[]): ResumenEmpleado[] {
  const porEmpleado = new Map<string, ResumenEmpleado>();
  for (const t of turnos) {
    let e = porEmpleado.get(t.empleado_id);
    if (!e) {
      e = { nombre: t.nombre, totalHoras: 0, enCurso: false };
      porEmpleado.set(t.empleado_id, e);
    }
    if (t.horas !== null) {
      e.totalHoras += t.horas;
    } else {
      e.enCurso = true;
    }
  }
  return Array.from(porEmpleado.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

const MARGEN_HORAS = 18;

export interface VentanaConMargen {
  /** Inicio del rango pedido por el usuario, sin margen (para filtrar al final). */
  desdeInicio: string;
  /** Fin del rango pedido por el usuario, sin margen (para filtrar al final). */
  hastaFin: string;
  /** Inicio a pedirle a la base: desdeInicio menos MARGEN_HORAS. */
  desdeConMargen: string;
  /** Fin a pedirle a la base: hastaFin más MARGEN_HORAS. */
  hastaConMargen: string;
}

/**
 * Ensancha el rango [desdeInicio, hastaFin] por MARGEN_HORAS para cada lado.
 * Necesario para no perder turnos que cruzan el borde del rango pedido (ej.
 * entrada 22:00 del último día, salida 06:00 del día siguiente) — spec §2.1.
 * El caller pide a la base con el rango ensanchado, empareja con
 * emparejarTurnos, y recién al final se queda con los turnos cuya entrada
 * cae dentro de [desdeInicio, hastaFin].
 */
export function ventanaConMargen(desdeInicio: string, hastaFin: string): VentanaConMargen {
  const margenMs = MARGEN_HORAS * 3600000;
  return {
    desdeInicio,
    hastaFin,
    desdeConMargen: new Date(new Date(desdeInicio).getTime() - margenMs).toISOString(),
    hastaConMargen: new Date(new Date(hastaFin).getTime() + margenMs).toISOString(),
  };
}
