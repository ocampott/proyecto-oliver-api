import { createServiceClient } from "./supabase-service.js";
import { dentroDeGeocerca } from "./geo.js";
import type { Sucursal } from "./sucursales.js";

export type TipoMarca = "entrada" | "salida";

export interface Asistencia {
  id: string;
  org_id: string;
  empleado_id: string;
  sucursal_id: string;
  tipo: TipoMarca;
  lat: number;
  lon: number;
  created_at: string;
}

export type MotivoRechazo =
  | "fuera_de_rango"
  | "sucursal_sin_gps"
  | "nombre_no_encontrado"
  | "dispositivo_ya_vinculado";

export async function registrarRechazo(
  orgId: string,
  input: {
    empleado_id?: string | null;
    sucursal_id?: string | null;
    tipo?: TipoMarca | null;
    lat?: number | null;
    lon?: number | null;
    distancia_metros?: number | null;
    motivo: MotivoRechazo;
  }
): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.from("asistencia_rechazada").insert({
    org_id: orgId,
    empleado_id: input.empleado_id ?? null,
    sucursal_id: input.sucursal_id ?? null,
    tipo: input.tipo ?? null,
    lat: input.lat ?? null,
    lon: input.lon ?? null,
    distancia_metros: input.distancia_metros ?? null,
    motivo: input.motivo,
  });
  if (error) throw error;
}

export type RegistrarResult =
  | { ok: true; asistencia: Asistencia }
  | { ok: false; motivo: "sucursal_sin_gps" }
  | { ok: false; motivo: "fuera_de_rango"; distancia: number };

/**
 * Registra una marca de entrada/salida validando la geocerca de la sucursal.
 * Los rechazos quedan en asistencia_rechazada (spec §12).
 */
export async function registrarMarca(
  orgId: string,
  empleadoId: string,
  sucursal: Sucursal,
  tipo: TipoMarca,
  lat: number,
  lon: number
): Promise<RegistrarResult> {
  const service = createServiceClient();

  const latSucursal = sucursal.lat;
  const lonSucursal = sucursal.lon;
  if (latSucursal == null || lonSucursal == null) {
    await registrarRechazo(orgId, {
      empleado_id: empleadoId,
      sucursal_id: sucursal.id,
      tipo,
      lat,
      lon,
      motivo: "sucursal_sin_gps",
    });
    return { ok: false, motivo: "sucursal_sin_gps" };
  }

  const { ok, distancia } = dentroDeGeocerca(
    { lat: latSucursal, lon: lonSucursal, radio_metros: sucursal.radio_metros },
    lat,
    lon
  );
  if (!ok) {
    await registrarRechazo(orgId, {
      empleado_id: empleadoId,
      sucursal_id: sucursal.id,
      tipo,
      lat,
      lon,
      distancia_metros: Math.round(distancia),
      motivo: "fuera_de_rango",
    });
    return { ok: false, motivo: "fuera_de_rango", distancia: Math.round(distancia) };
  }

  const { data, error } = await service
    .from("asistencia")
    .insert({
      org_id: orgId,
      empleado_id: empleadoId,
      sucursal_id: sucursal.id,
      tipo,
      lat,
      lon,
    })
    .select()
    .single();
  if (error) throw error;
  return { ok: true, asistencia: data };
}

// ── Listados y revisión (admin) ─────────────────────────────────────────────

// Argentina no tiene DST: las fechas "del día" se calculan con offset fijo
// -03:00, igual que el '-3 hours' del sistema viejo.
const AR_OFFSET = "-03:00";

function diaUtcInicio(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00${AR_OFFSET}`).toISOString();
}

function diaUtcFin(isoDate: string): string {
  return new Date(`${isoDate}T23:59:59.999${AR_OFFSET}`).toISOString();
}

export interface AsistenciaConNombres extends Asistencia {
  empleado_nombre: string | null;
  sucursal_nombre: string | null;
}

export async function listAsistencia(
  orgId: string,
  filters: { desde: string; hasta: string; sucursalId?: string; empleadoId?: string }
): Promise<AsistenciaConNombres[]> {
  const service = createServiceClient();
  let query = service
    .from("asistencia")
    .select("*, empleados(nombre), sucursales(nombre)")
    .eq("org_id", orgId)
    .gte("created_at", diaUtcInicio(filters.desde))
    .lte("created_at", diaUtcFin(filters.hasta))
    .order("created_at", { ascending: false })
    .limit(500);
  if (filters.sucursalId) query = query.eq("sucursal_id", filters.sucursalId);
  if (filters.empleadoId) query = query.eq("empleado_id", filters.empleadoId);

  const { data, error } = await query;
  if (error) throw error;
  return data.map((r) => ({
    ...r,
    empleado_nombre: r.empleados?.nombre ?? null,
    sucursal_nombre: r.sucursales?.nombre ?? null,
    empleados: undefined,
    sucursales: undefined,
  }));
}

export async function deleteAsistencia(orgId: string, id: string): Promise<void> {
  const service = createServiceClient();
  const { error } = await service
    .from("asistencia")
    .delete()
    .eq("org_id", orgId)
    .eq("id", id);
  if (error) throw error;
}

export interface Rechazada {
  id: string;
  org_id: string;
  empleado_id: string | null;
  sucursal_id: string | null;
  tipo: TipoMarca | null;
  lat: number | null;
  lon: number | null;
  distancia_metros: number | null;
  motivo: MotivoRechazo;
  resuelto: boolean;
  created_at: string;
  empleado_nombre: string | null;
  sucursal_nombre: string | null;
}

/** Intentos rechazados sin resolver (la vista "pendientes" de la v1). */
export async function listRechazadas(orgId: string): Promise<Rechazada[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("asistencia_rechazada")
    .select("*, empleados(nombre), sucursales(nombre)")
    .eq("org_id", orgId)
    .eq("resuelto", false)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data.map((r) => ({
    ...r,
    empleado_nombre: r.empleados?.nombre ?? null,
    sucursal_nombre: r.sucursales?.nombre ?? null,
    empleados: undefined,
    sucursales: undefined,
  }));
}

/**
 * Aprueba el intento: lo inserta en `asistencia` con la fecha/hora ORIGINAL
 * del intento (no la de ahora) y lo marca resuelto. Requiere que el intento
 * tenga empleado, sucursal, tipo y coordenadas — si no, hay que resolver la
 * causa de fondo y descartar la alerta (misma semántica del viejo
 * aprobarAsistenciaRechazada).
 */
export async function aprobarRechazada(orgId: string, id: string): Promise<void> {
  const service = createServiceClient();
  const { data: row, error } = await service
    .from("asistencia_rechazada")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error("Intento no encontrado");
  if (!row.empleado_id || !row.sucursal_id || !row.tipo || row.lat == null || row.lon == null) {
    throw new Error("Este intento no tiene empleado/sucursal/tipo/ubicación completos — no se puede aprobar directamente.");
  }

  const { error: insErr } = await service.from("asistencia").insert({
    org_id: orgId,
    empleado_id: row.empleado_id,
    sucursal_id: row.sucursal_id,
    tipo: row.tipo,
    lat: row.lat,
    lon: row.lon,
    created_at: row.created_at,
  });
  if (insErr) throw insErr;

  const { error: updErr } = await service
    .from("asistencia_rechazada")
    .update({ resuelto: true })
    .eq("id", id);
  if (updErr) throw updErr;
}

export async function descartarRechazada(orgId: string, id: string): Promise<void> {
  const service = createServiceClient();
  const { error } = await service
    .from("asistencia_rechazada")
    .update({ resuelto: true })
    .eq("org_id", orgId)
    .eq("id", id);
  if (error) throw error;
}

// ── Horas trabajadas ────────────────────────────────────────────────────────
// Empareja cada "entrada" con la siguiente "salida" cronológica del mismo
// empleado+sucursal (port de calcularHorasTrabajadas del sistema viejo).
// Salida sin entrada previa: dato huérfano, se ignora. Entrada sin salida:
// turno en curso (horas: null).

export interface Turno {
  empleado_id: string;
  nombre: string;
  sucursal_id: string;
  sucursal_nombre: string;
  entrada_at: string;
  salida_at: string | null;
  horas: number | null;
}

export async function calcularHoras(
  orgId: string,
  filters: { desde: string; hasta: string; sucursalId?: string }
): Promise<Turno[]> {
  const service = createServiceClient();
  let query = service
    .from("asistencia")
    .select("empleado_id, sucursal_id, tipo, created_at, empleados(nombre), sucursales(nombre)")
    .eq("org_id", orgId)
    .gte("created_at", diaUtcInicio(filters.desde))
    .lte("created_at", diaUtcFin(filters.hasta))
    .order("created_at", { ascending: true });
  if (filters.sucursalId) query = query.eq("sucursal_id", filters.sucursalId);

  const { data, error } = await query;
  if (error) throw error;

  interface Reg {
    empleado_id: string;
    sucursal_id: string;
    tipo: TipoMarca;
    created_at: string;
    nombre: string;
    sucursal_nombre: string;
  }
  // supabase-js tipa los joins como array; con FK many-to-one viene un solo
  // elemento (o el objeto, según la versión).
  const nombreDe = (rel: { nombre: string } | { nombre: string }[] | null): string =>
    (Array.isArray(rel) ? rel[0]?.nombre : rel?.nombre) ?? "?";

  const regs: Reg[] = data.map((r) => ({
    empleado_id: r.empleado_id,
    sucursal_id: r.sucursal_id,
    tipo: r.tipo,
    created_at: r.created_at,
    nombre: nombreDe(r.empleados),
    sucursal_nombre: nombreDe(r.sucursales),
  }));

  const porPar = new Map<string, Reg[]>();
  for (const r of regs) {
    const key = `${r.empleado_id}:${r.sucursal_id}`;
    if (!porPar.has(key)) porPar.set(key, []);
    porPar.get(key)!.push(r);
  }

  const turnos: Turno[] = [];
  for (const regsDelPar of porPar.values()) {
    let pendiente: Reg | null = null;
    const aTurno = (entrada: Reg, salida: Reg | null): Turno => ({
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
      } else if (pendiente) {
        turnos.push(aTurno(pendiente, r));
        pendiente = null;
      }
      // salida sin entrada previa: dato huérfano, se ignora
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
