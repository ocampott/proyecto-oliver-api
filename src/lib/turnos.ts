import { createServiceClient } from "./supabase-service.js";
import { calcularHoras } from "./asistencia.js";
import {
  calcularCumplimientoPuro,
  type CumplimientoRow,
  type HorarioParaMatch,
} from "./cumplimiento-calculo.js";

export type { CumplimientoRow };

// ── Horarios esperados por empleado ─────────────────────────────────────────
// Franjas definidas a mano (día de semana + hora inicio/fin). Un empleado
// puede tener varias filas: turno partido (mismo día, dos franjas) y/o
// trabajar en más de una sucursal. dia_semana sigue Date.getUTCDay():
// 0=domingo ... 6=sábado. sucursal_id es opcional y solo informativo — el
// cumplimiento (ver más abajo en este archivo) compara únicamente
// empleado + día + hora, sin importar dónde marcó.

export interface HorarioEmpleado {
  id: string;
  empleado_id: string;
  sucursal_id: string | null;
  sucursal_nombre: string | null;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  tolerancia_min: number | null;
}

interface HorarioRow {
  id: string;
  empleado_id: string;
  sucursal_id: string | null;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  tolerancia_min: number | null;
  sucursales: { nombre: string } | { nombre: string }[] | null;
}

function nombreDe(rel: { nombre: string } | { nombre: string }[] | null): string | null {
  return (Array.isArray(rel) ? rel[0]?.nombre : rel?.nombre) ?? null;
}

export async function listHorarios(orgId: string, empleadoId?: string): Promise<HorarioEmpleado[]> {
  const service = createServiceClient();
  let query = service
    .from("horarios_empleado")
    .select("id, empleado_id, sucursal_id, dia_semana, hora_inicio, hora_fin, tolerancia_min, sucursales(nombre)")
    .eq("org_id", orgId)
    .order("dia_semana")
    .order("hora_inicio");
  if (empleadoId) query = query.eq("empleado_id", empleadoId);

  const { data, error } = await query;
  if (error) throw error;
  return (data as HorarioRow[]).map((r) => ({
    id: r.id,
    empleado_id: r.empleado_id,
    sucursal_id: r.sucursal_id,
    sucursal_nombre: nombreDe(r.sucursales),
    dia_semana: r.dia_semana,
    hora_inicio: r.hora_inicio,
    hora_fin: r.hora_fin,
    tolerancia_min: r.tolerancia_min,
  }));
}

export async function insertHorario(
  orgId: string,
  params: {
    empleado_id: string;
    sucursal_id?: string | null;
    dia_semana: number;
    hora_inicio: string;
    hora_fin: string;
    tolerancia_min?: number | null;
  }
): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.from("horarios_empleado").insert({
    org_id: orgId,
    empleado_id: params.empleado_id,
    sucursal_id: params.sucursal_id ?? null,
    dia_semana: params.dia_semana,
    hora_inicio: params.hora_inicio,
    hora_fin: params.hora_fin,
    tolerancia_min: params.tolerancia_min ?? null,
  });
  if (error) throw error;
}

export async function updateHorario(
  orgId: string,
  id: string,
  patch: {
    sucursal_id?: string | null;
    dia_semana?: number;
    hora_inicio?: string;
    hora_fin?: string;
    tolerancia_min?: number | null;
  }
): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.from("horarios_empleado").update(patch).eq("org_id", orgId).eq("id", id);
  if (error) throw error;
}

export async function deleteHorario(orgId: string, id: string): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.from("horarios_empleado").delete().eq("org_id", orgId).eq("id", id);
  if (error) throw error;
}

// Asigna el mismo turno a varios empleados y varios días en un solo paso —
// una fila en horarios_empleado por cada combinación empleado × día.
export async function insertHorariosBulk(
  orgId: string,
  params: {
    empleado_ids: string[];
    dias_semana: number[];
    hora_inicio: string;
    hora_fin: string;
    tolerancia_min?: number | null;
  }
): Promise<void> {
  const service = createServiceClient();
  const rows = params.empleado_ids.flatMap((empleado_id) =>
    params.dias_semana.map((dia_semana) => ({
      org_id: orgId,
      empleado_id,
      dia_semana,
      hora_inicio: params.hora_inicio,
      hora_fin: params.hora_fin,
      tolerancia_min: params.tolerancia_min ?? null,
    }))
  );
  const { error } = await service.from("horarios_empleado").insert(rows);
  if (error) throw error;
}

// ── Plantillas de turno ──────────────────────────────────────────────────────
// Molde con nombre reutilizable (horario + opcionalmente los días habituales)
// para no tipear el horario cada vez al asignar. Sin sucursal a propósito:
// eso se elige al momento de asignar, no queda atado a la plantilla.

export interface TurnoTemplate {
  id: string;
  nombre: string;
  hora_inicio: string;
  hora_fin: string;
  dias_semana: number[];
  tolerancia_min: number | null;
}

export async function listTurnoTemplates(orgId: string): Promise<TurnoTemplate[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("turno_templates")
    .select("id, nombre, hora_inicio, hora_fin, dias_semana, tolerancia_min")
    .eq("org_id", orgId)
    .order("nombre");
  if (error) throw error;
  return data as TurnoTemplate[];
}

export async function insertTurnoTemplate(
  orgId: string,
  input: {
    nombre: string;
    hora_inicio: string;
    hora_fin: string;
    dias_semana: number[];
    tolerancia_min?: number | null;
  }
): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.from("turno_templates").insert({
    org_id: orgId,
    nombre: input.nombre,
    hora_inicio: input.hora_inicio,
    hora_fin: input.hora_fin,
    dias_semana: input.dias_semana,
    tolerancia_min: input.tolerancia_min ?? null,
  });
  if (error) {
    if (error.code === "23505") throw new Error("Ya existe una plantilla con ese nombre");
    throw error;
  }
}

export async function updateTurnoTemplate(
  orgId: string,
  id: string,
  patch: {
    nombre?: string;
    hora_inicio?: string;
    hora_fin?: string;
    dias_semana?: number[];
    tolerancia_min?: number | null;
  }
): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.from("turno_templates").update(patch).eq("org_id", orgId).eq("id", id);
  if (error) {
    if (error.code === "23505") throw new Error("Ya existe una plantilla con ese nombre");
    throw error;
  }
}

export async function deleteTurnoTemplate(orgId: string, id: string): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.from("turno_templates").delete().eq("org_id", orgId).eq("id", id);
  if (error) throw error;
}

// ── Tolerancia general de la org ─────────────────────────────────────────────
// Vive en org_settings.tolerancia_min (columna agregada en la migración
// 0004) en vez de una tabla "settings" singleton propia — cada org ya tiene
// su fila de org_settings creada al alta (server/src/lib/organizations.ts).

export async function getTolerancia(orgId: string): Promise<number> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("org_settings")
    .select("tolerancia_min")
    .eq("org_id", orgId)
    .single();
  if (error) throw error;
  return data.tolerancia_min;
}

export async function setTolerancia(orgId: string, min: number): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.from("org_settings").update({ tolerancia_min: min }).eq("org_id", orgId);
  if (error) throw error;
}

// ── Cumplimiento de horarios ─────────────────────────────────────────────────
// El cálculo en sí (matchear turno real contra horario esperado, con
// tolerancia) es lógica pura y vive en cumplimiento-calculo.ts (testeable
// sin DB). Acá solo se hace el fetch y se delega. A diferencia del repo
// externo (que matcheaba por nombre normalizado), acá se matchea por
// empleado_id — FK real.

export async function calcularCumplimiento(
  orgId: string,
  filters: { desde: string; hasta: string; sucursalId?: string; empleadoId?: string }
): Promise<CumplimientoRow[]> {
  const service = createServiceClient();

  const [toleranciaGeneral, turnosTodos, horariosRes] = await Promise.all([
    getTolerancia(orgId),
    calcularHoras(orgId, { desde: filters.desde, hasta: filters.hasta, sucursalId: filters.sucursalId }),
    service
      .from("horarios_empleado")
      .select("empleado_id, dia_semana, hora_inicio, hora_fin, tolerancia_min")
      .eq("org_id", orgId),
  ]);
  if (horariosRes.error) throw horariosRes.error;
  const horarios = horariosRes.data as HorarioParaMatch[];

  return calcularCumplimientoPuro(turnosTodos, horarios, toleranciaGeneral, filters.empleadoId);
}
