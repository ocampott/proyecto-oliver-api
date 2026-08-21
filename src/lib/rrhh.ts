import { createServiceClient } from "./supabase-service.js";

// ── Ausencias y licencias ────────────────────────────────────────────────────
// Reemplazo standalone del RRHH del repo externo (que parseaba mensajes de
// WhatsApp) — acá la carga es siempre manual, desde el panel. sucursal_id es
// opcional a propósito: empleados no tiene sucursal fija (un empleado puede
// marcar en más de una).

export interface Ausencia {
  id: string;
  empleado_id: string;
  empleado_nombre: string;
  sucursal_id: string | null;
  sucursal_nombre: string | null;
  fecha_desde: string;
  fecha_hasta: string;
  motivo: string;
  detalle: string | null;
  contacto: string | null;
  certificado_pendiente: boolean;
  created_at: string;
}

interface AusenciaRow {
  id: string;
  empleado_id: string;
  sucursal_id: string | null;
  fecha_desde: string;
  fecha_hasta: string;
  motivo: string;
  detalle: string | null;
  contacto: string | null;
  certificado_pendiente: boolean;
  created_at: string;
  empleados: { nombre: string } | { nombre: string }[] | null;
  sucursales: { nombre: string } | { nombre: string }[] | null;
}

function nombreDe(rel: { nombre: string } | { nombre: string }[] | null): string | null {
  return (Array.isArray(rel) ? rel[0]?.nombre : rel?.nombre) ?? null;
}

export async function listAusencias(
  orgId: string,
  filters?: { desde?: string; hasta?: string; sucursalId?: string; motivo?: string; empleadoId?: string }
): Promise<Ausencia[]> {
  const service = createServiceClient();
  let query = service
    .from("ausencias")
    .select(
      "id, empleado_id, sucursal_id, fecha_desde, fecha_hasta, motivo, detalle, contacto, certificado_pendiente, created_at, empleados(nombre), sucursales(nombre)"
    )
    .eq("org_id", orgId)
    .order("fecha_desde", { ascending: false });
  // Overlap con el rango filtrado: la ausencia no terminó antes de "desde" y no empieza después de "hasta".
  if (filters?.desde) query = query.gte("fecha_hasta", filters.desde);
  if (filters?.hasta) query = query.lte("fecha_desde", filters.hasta);
  if (filters?.sucursalId) query = query.eq("sucursal_id", filters.sucursalId);
  if (filters?.motivo) query = query.eq("motivo", filters.motivo);
  if (filters?.empleadoId) query = query.eq("empleado_id", filters.empleadoId);

  const { data, error } = await query;
  if (error) throw error;
  return (data as AusenciaRow[]).map((r) => ({
    id: r.id,
    empleado_id: r.empleado_id,
    empleado_nombre: nombreDe(r.empleados) ?? "?",
    sucursal_id: r.sucursal_id,
    sucursal_nombre: nombreDe(r.sucursales),
    fecha_desde: r.fecha_desde,
    fecha_hasta: r.fecha_hasta,
    motivo: r.motivo,
    detalle: r.detalle,
    contacto: r.contacto,
    certificado_pendiente: r.certificado_pendiente,
    created_at: r.created_at,
  }));
}

export async function insertAusencia(
  orgId: string,
  input: {
    empleado_id: string;
    sucursal_id?: string | null;
    fecha_desde: string;
    fecha_hasta: string;
    motivo: string;
    detalle?: string | null;
    contacto?: string | null;
    certificado_pendiente?: boolean;
  }
): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.from("ausencias").insert({
    org_id: orgId,
    empleado_id: input.empleado_id,
    sucursal_id: input.sucursal_id ?? null,
    fecha_desde: input.fecha_desde,
    fecha_hasta: input.fecha_hasta,
    motivo: input.motivo,
    detalle: input.detalle ?? null,
    contacto: input.contacto ?? null,
    certificado_pendiente: input.certificado_pendiente ?? false,
  });
  if (error) throw error;
}

export async function updateAusencia(
  orgId: string,
  id: string,
  patch: {
    sucursal_id?: string | null;
    fecha_desde?: string;
    fecha_hasta?: string;
    motivo?: string;
    detalle?: string | null;
    contacto?: string | null;
    certificado_pendiente?: boolean;
  }
): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.from("ausencias").update(patch).eq("org_id", orgId).eq("id", id);
  if (error) throw error;
}

export async function deleteAusencia(orgId: string, id: string): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.from("ausencias").delete().eq("org_id", orgId).eq("id", id);
  if (error) throw error;
}

// ── Categorías de motivo (org_settings.rrhh_categorias) ─────────────────────
// La columna ya existe desde 0002_org_settings_and_admins.sql — acá se
// empieza a usar por primera vez.

export async function getRrhhCategorias(orgId: string): Promise<string[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("org_settings")
    .select("rrhh_categorias")
    .eq("org_id", orgId)
    .single();
  if (error) throw error;
  return data.rrhh_categorias;
}

export async function setRrhhCategorias(orgId: string, categorias: string[]): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.from("org_settings").update({ rrhh_categorias: categorias }).eq("org_id", orgId);
  if (error) throw error;
}

// ── Resumen ───────────────────────────────────────────────────────────────────

export interface ResumenAusencias {
  total: number;
  certificadosPendientes: number;
  porSucursal: Record<string, number>;
  porMotivo: Record<string, number>;
}

export function calcularResumenAusencias(ausencias: Ausencia[]): ResumenAusencias {
  const porSucursal: Record<string, number> = {};
  const porMotivo: Record<string, number> = {};
  let certificadosPendientes = 0;

  for (const a of ausencias) {
    const sucursal = a.sucursal_nombre ?? "Sin sucursal";
    porSucursal[sucursal] = (porSucursal[sucursal] ?? 0) + 1;
    porMotivo[a.motivo] = (porMotivo[a.motivo] ?? 0) + 1;
    if (a.certificado_pendiente) certificadosPendientes++;
  }

  return { total: ausencias.length, certificadosPendientes, porSucursal, porMotivo };
}
