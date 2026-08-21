import { createServiceClient } from "./supabase-service.js";

export interface Sucursal {
  id: string;
  org_id: string;
  nombre: string;
  lat: number | null;
  lon: number | null;
  radio_metros: number;
  direccion: string | null;
  activa: boolean;
  created_at: string;
}

export async function listSucursales(orgId: string): Promise<(Sucursal & { tiene_asistencia: boolean })[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("sucursales")
    .select("*")
    .eq("org_id", orgId)
    .order("nombre");
  if (error) throw error;

  // Solo hace falta saber esto para las inactivas (es lo único que usa el
  // botón de eliminar) — evita traer toda la tabla de asistencia del org,
  // que con Supabase se corta en 1000 filas y daba falsos negativos.
  const inactivas = data.filter((s) => !s.activa);
  const flags = await Promise.all(inactivas.map((s) => tieneAsistencia(orgId, s.id)));
  const conAsistencia = new Set(inactivas.filter((_, i) => flags[i]).map((s) => s.id));

  return data.map((s) => ({ ...s, tiene_asistencia: conAsistencia.has(s.id) }));
}

export async function createSucursal(
  orgId: string,
  input: { nombre: string; lat?: number; lon?: number; radio_metros?: number; direccion?: string | null }
): Promise<Sucursal> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("sucursales")
    .insert({
      org_id: orgId,
      nombre: input.nombre,
      lat: input.lat ?? null,
      lon: input.lon ?? null,
      radio_metros: input.radio_metros ?? 100,
      direccion: input.direccion ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateSucursal(
  orgId: string,
  id: string,
  patch: {
    nombre?: string;
    lat?: number | null;
    lon?: number | null;
    radio_metros?: number;
    direccion?: string | null;
    activa?: boolean;
  }
): Promise<Sucursal> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("sucursales")
    .update(patch)
    .eq("org_id", orgId)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getSucursal(orgId: string, id: string): Promise<Sucursal | null> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("sucursales")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function tieneAsistencia(orgId: string, id: string): Promise<boolean> {
  const service = createServiceClient();
  const { count, error } = await service
    .from("asistencia")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("sucursal_id", id);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function countSucursalesActivas(orgId: string): Promise<number> {
  const service = createServiceClient();
  const { count, error } = await service
    .from("sucursales")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("activa", true);
  if (error) throw error;
  return count ?? 0;
}

export async function deleteSucursal(orgId: string, id: string): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.from("sucursales").delete().eq("org_id", orgId).eq("id", id);
  if (error) throw error;
}
