import { readAll } from "./read-all.js";
import { createServiceClient } from "./supabase-service.js";
import { dentroDeGeocerca } from "./geo.js";
import type { Sucursal } from "./sucursales.js";
import {
  emparejarTurnos,
  calcularResumenHoras,
  ventanaConMargen,
  type RegistroCrudo,
  type Turno,
  type ResumenEmpleado,
} from "./horas-calculo.js";
import { rangeFor, buildMeta, type PaginationParams, type Paginated } from "./pagination.js";

export { calcularResumenHoras };
export type { Turno, ResumenEmpleado };

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
  filters: { desde: string; hasta: string; sucursalId?: string; empleadoId?: string; tipo?: TipoMarca }
): Promise<AsistenciaConNombres[]>;
export async function listAsistencia(
  orgId: string,
  filters: { desde: string; hasta: string; sucursalId?: string; empleadoId?: string; tipo?: TipoMarca },
  params: PaginationParams
): Promise<Paginated<AsistenciaConNombres>>;
export async function listAsistencia(
  orgId: string,
  filters: { desde: string; hasta: string; sucursalId?: string; empleadoId?: string; tipo?: TipoMarca },
  params?: PaginationParams
): Promise<AsistenciaConNombres[] | Paginated<AsistenciaConNombres>> {
  const service = createServiceClient();
  let query = service
    .from("asistencia")
    .select("*, empleados(nombre), sucursales(nombre)", params ? { count: "exact" } : undefined)
    .eq("org_id", orgId)
    .gte("created_at", diaUtcInicio(filters.desde))
    .lte("created_at", diaUtcFin(filters.hasta))
    .order("created_at", { ascending: false });
  if (filters.sucursalId) query = query.eq("sucursal_id", filters.sucursalId);
  if (filters.empleadoId) query = query.eq("empleado_id", filters.empleadoId);
  if (filters.tipo) query = query.eq("tipo", filters.tipo);
  if (params) {
    const { from, to } = rangeFor(params);
    query = query.range(from, to);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  const mapped = data.map((r) => ({
    ...r,
    empleado_nombre: r.empleados?.nombre ?? null,
    sucursal_nombre: r.sucursales?.nombre ?? null,
    empleados: undefined,
    sucursales: undefined,
  }));

  return params ? { data: mapped, pagination: buildMeta(params, count ?? 0) } : mapped;
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
export async function listRechazadas(orgId: string): Promise<Rechazada[]>;
export async function listRechazadas(orgId: string, params: PaginationParams): Promise<Paginated<Rechazada>>;
export async function listRechazadas(
  orgId: string,
  params?: PaginationParams
): Promise<Rechazada[] | Paginated<Rechazada>> {
  const service = createServiceClient();
  let query = service
    .from("asistencia_rechazada")
    .select("*, empleados(nombre), sucursales(nombre)", params ? { count: "exact" } : undefined)
    .eq("org_id", orgId)
    .eq("resuelto", false)
    .order("created_at", { ascending: false });
  if (params) {
    const { from, to } = rangeFor(params);
    query = query.range(from, to);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  const mapped = data.map((r) => ({
    ...r,
    empleado_nombre: r.empleados?.nombre ?? null,
    sucursal_nombre: r.sucursales?.nombre ?? null,
    empleados: undefined,
    sucursales: undefined,
  }));

  return params ? { data: mapped, pagination: buildMeta(params, count ?? 0) } : mapped;
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
// El emparejamiento entrada/salida es lógica pura y vive en horas-calculo.ts
// (testeable sin DB). Acá solo se pide a la base con margen de 18hs para no
// perder turnos que cruzan el borde del rango (ej. entrada 22:00 del último
// día pedido, salida 06:00 del día siguiente — spec §2.1) y se filtra el
// resultado a los turnos que arrancaron dentro del rango pedido.

export async function calcularHoras(
  orgId: string,
  filters: { desde: string; hasta: string; sucursalId?: string }
): Promise<Turno[]> {
  const service = createServiceClient();
  const ventana = ventanaConMargen(diaUtcInicio(filters.desde), diaUtcFin(filters.hasta));

  let query = service
    .from("asistencia")
    .select("empleado_id, sucursal_id, tipo, created_at, empleados(nombre), sucursales(nombre)")
    .eq("org_id", orgId)
    .gte("created_at", ventana.desdeConMargen)
    .lte("created_at", ventana.hastaConMargen)
    .order("created_at", { ascending: true }).order("id");
  if (filters.sucursalId) query = query.eq("sucursal_id", filters.sucursalId);

  const data = await readAll((from, to) => query.range(from, to));

  // supabase-js tipa los joins como array; con FK many-to-one viene un solo
  // elemento (o el objeto, según la versión).
  const nombreDe = (rel: { nombre: string } | { nombre: string }[] | null): string =>
    (Array.isArray(rel) ? rel[0]?.nombre : rel?.nombre) ?? "?";

  const regs: RegistroCrudo[] = data.map((r) => ({
    empleado_id: r.empleado_id,
    sucursal_id: r.sucursal_id,
    tipo: r.tipo,
    created_at: r.created_at,
    nombre: nombreDe(r.empleados),
    sucursal_nombre: nombreDe(r.sucursales),
  }));

  return emparejarTurnos(regs).filter(
    (t) => t.entrada_at >= ventana.desdeInicio && t.entrada_at <= ventana.hastaFin
  );
}
