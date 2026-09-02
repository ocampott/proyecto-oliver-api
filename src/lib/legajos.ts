import { createServiceClient } from "./supabase-service.js";
import { listEmpleadosPaginado, nombreCompleto, type EstadoEmpleado } from "./empleados.js";
import type { PaginationParams, Paginated } from "./pagination.js";

// ── Legajos: archivos por empleado ────────────────────────────────────────
// Metadata en la tabla legajo_archivos, contenido en el bucket privado de
// Supabase Storage "legajos" (ver migración 0012). El acceso al bucket pasa
// siempre por acá (service role) — nunca directo desde el cliente.

const BUCKET = "legajos";
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export interface LegajoArchivo {
  id: string;
  empleado_id: string;
  ausencia_id: string | null;
  nombre_original: string;
  storage_path: string;
  mimetype: string;
  tamanio_bytes: number;
  origen: "manual" | "chat_empleado";
  subido_por: string | null;
  created_at: string;
}

function sanitizarNombreArchivo(nombre: string): string {
  const base = nombre.replace(/[/\\?%*:|"<>]/g, "_").slice(-150);
  return base.length > 0 ? base : "archivo";
}

export async function guardarLegajoArchivo(
  orgId: string,
  params: {
    empleadoId: string;
    nombreOriginal: string;
    buffer: Buffer;
    mimetype: string;
    origen: "manual" | "chat_empleado";
    ausenciaId?: string | null;
    subidoPor?: string | null;
  }
): Promise<LegajoArchivo> {
  if (params.buffer.length === 0) throw new Error("El archivo está vacío");
  if (params.buffer.length > MAX_BYTES) throw new Error("El archivo supera el límite de 20 MB");

  const service = createServiceClient();
  const storagePath = `${orgId}/${params.empleadoId}/${Date.now()}-${sanitizarNombreArchivo(params.nombreOriginal)}`;

  const upload = await service.storage.from(BUCKET).upload(storagePath, params.buffer, {
    contentType: params.mimetype,
  });
  if (upload.error) throw upload.error;

  const { data, error } = await service
    .from("legajo_archivos")
    .insert({
      org_id: orgId,
      empleado_id: params.empleadoId,
      ausencia_id: params.ausenciaId ?? null,
      nombre_original: params.nombreOriginal,
      storage_path: storagePath,
      mimetype: params.mimetype,
      tamanio_bytes: params.buffer.length,
      origen: params.origen,
      subido_por: params.subidoPor ?? null,
    })
    .select()
    .single();
  if (error) {
    await service.storage.from(BUCKET).remove([storagePath]);
    throw error;
  }
  return data;
}

export async function listLegajoArchivos(orgId: string, empleadoId: string): Promise<LegajoArchivo[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("legajo_archivos")
    .select("*")
    .eq("org_id", orgId)
    .eq("empleado_id", empleadoId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getLegajoArchivo(orgId: string, id: string): Promise<LegajoArchivo | null> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("legajo_archivos")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function descargarLegajoArchivo(archivo: LegajoArchivo): Promise<Buffer> {
  const service = createServiceClient();
  const { data, error } = await service.storage.from(BUCKET).download(archivo.storage_path);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

export async function eliminarLegajoArchivo(orgId: string, id: string): Promise<boolean> {
  const archivo = await getLegajoArchivo(orgId, id);
  if (!archivo) return false;
  const service = createServiceClient();
  await service.storage.from(BUCKET).remove([archivo.storage_path]);
  const { error } = await service.from("legajo_archivos").delete().eq("org_id", orgId).eq("id", id);
  if (error) throw error;
  return true;
}

// Marca la ausencia asociada a un certificado como entregada (limpia
// certificado_pendiente) — se llama después de subir el archivo desde el
// chat de empleados.
export async function marcarCertificadoEntregado(orgId: string, ausenciaId: string): Promise<void> {
  const service = createServiceClient();
  const { error } = await service
    .from("ausencias")
    .update({ certificado_pendiente: false })
    .eq("org_id", orgId)
    .eq("id", ausenciaId);
  if (error) throw error;
}

export interface LegajoResumen {
  empleado_id: string;
  nombre: string;
  estado: EstadoEmpleado;
  cantidad_archivos: number;
  ultimo_archivo_at: string | null;
}

// Pagina sobre los empleados (reusa listEmpleadosPaginado, mismo filtro `q`
// que Empleados) y les suma el conteo de archivos de la página actual —
// evita traer legajo_archivos completo para calcular un resumen.
export async function listLegajosResumen(
  orgId: string,
  params: PaginationParams & { q?: string }
): Promise<Paginated<LegajoResumen>> {
  const service = createServiceClient();
  const empleadosPagina = await listEmpleadosPaginado(orgId, params);

  const ids = empleadosPagina.data.map((e) => e.id);
  const info = new Map<string, { cantidad: number; ultimo: string | null }>();
  if (ids.length > 0) {
    const { data, error } = await service
      .from("legajo_archivos")
      .select("empleado_id, created_at")
      .eq("org_id", orgId)
      .in("empleado_id", ids);
    if (error) throw error;
    for (const a of data as { empleado_id: string; created_at: string }[]) {
      const actual = info.get(a.empleado_id) ?? { cantidad: 0, ultimo: null };
      actual.cantidad += 1;
      if (!actual.ultimo || a.created_at > actual.ultimo) actual.ultimo = a.created_at;
      info.set(a.empleado_id, actual);
    }
  }

  return {
    data: empleadosPagina.data.map((e) => {
      const i = info.get(e.id) ?? { cantidad: 0, ultimo: null };
      return { empleado_id: e.id, nombre: nombreCompleto(e), estado: e.estado, cantidad_archivos: i.cantidad, ultimo_archivo_at: i.ultimo };
    }),
    pagination: empleadosPagina.pagination,
  };
}
