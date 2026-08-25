import { createServiceClient } from "./supabase-service.js";
import { validarEmpleado, buscarEmpleadoParecido } from "./nomina.js";

export type EstadoEmpleado = "activo" | "de_licencia" | "suspendido" | "baja";

export interface Empleado {
  id: string;
  org_id: string;
  nombre: string;
  apellido: string | null;
  celular: string | null;
  cuil: string | null;
  fecha_ingreso: string | null;
  sucursal_id: string | null;
  device_token: string | null;
  estado: EstadoEmpleado;
  created_at: string;
}

export async function listEmpleados(orgId: string): Promise<(Empleado & { tiene_asistencia: boolean })[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("empleados")
    .select("*")
    .eq("org_id", orgId)
    .order("nombre");
  if (error) throw error;

  // Igual que en sucursales.ts: solo hace falta saber esto para los
  // inactivos (es lo único que usa el botón de eliminar).
  const inactivos = data.filter((e) => e.estado === "baja");
  const flags = await Promise.all(inactivos.map((e) => tieneAsistencia(orgId, e.id)));
  const conAsistencia = new Set(inactivos.filter((_, i) => flags[i]).map((e) => e.id));

  return data.map((e) => ({ ...e, tiene_asistencia: conAsistencia.has(e.id) }));
}

export async function createEmpleado(
  orgId: string,
  input: {
    nombre: string;
    apellido?: string;
    celular?: string;
    cuil?: string;
    fecha_ingreso?: string;
    sucursal_id?: string;
  }
): Promise<Empleado> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("empleados")
    .insert({
      org_id: orgId,
      nombre: input.nombre,
      apellido: input.apellido ?? null,
      celular: input.celular ?? null,
      cuil: input.cuil ?? null,
      fecha_ingreso: input.fecha_ingreso ?? null,
      sucursal_id: input.sucursal_id ?? null,
    })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("cuil_duplicado");
    throw error;
  }
  return data;
}

/**
 * Crea el empleado y chequea el tope de activos del plan en una sola
 * transacción de Postgres (función crear_empleado_con_limite, ver
 * supabase/migrations/0008_limites_atomic.sql), para que dos requests
 * concurrentes no puedan pasar el chequeo a la vez y superar el límite.
 * max = null → sin límite (plan ilimitado/superadmin).
 */
export async function createEmpleadoConLimite(
  orgId: string,
  input: {
    nombre: string;
    apellido?: string;
    celular?: string;
    cuil?: string;
    fecha_ingreso?: string;
    sucursal_id?: string;
  },
  max: number | null
): Promise<Empleado> {
  const service = createServiceClient();
  const { data, error } = await service.rpc("crear_empleado_con_limite", {
    p_org_id: orgId,
    p_nombre: input.nombre,
    p_celular: input.celular ?? null,
    p_apellido: input.apellido ?? null,
    p_cuil: input.cuil ?? null,
    p_fecha_ingreso: input.fecha_ingreso ?? null,
    p_sucursal_id: input.sucursal_id ?? null,
    p_max: max,
  });
  if (error) {
    if (error.code === "23505") throw new Error("cuil_duplicado");
    throw error;
  }
  return data as Empleado;
}

/** Mismo chequeo atómico que createEmpleadoConLimite, para reactivar uno existente (o cambiar su estado). */
export async function reactivarEmpleadoConLimite(
  orgId: string,
  id: string,
  nuevoEstado: EstadoEmpleado,
  max: number | null
): Promise<Empleado> {
  const service = createServiceClient();
  const { data, error } = await service.rpc("reactivar_empleado_con_limite", {
    p_org_id: orgId,
    p_id: id,
    p_max: max,
    p_nuevo_estado: nuevoEstado,
  });
  if (error) throw error;
  return data as Empleado;
}

export async function updateEmpleado(
  orgId: string,
  id: string,
  patch: {
    nombre?: string;
    apellido?: string | null;
    celular?: string | null;
    cuil?: string | null;
    fecha_ingreso?: string | null;
    sucursal_id?: string | null;
  }
): Promise<Empleado> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("empleados")
    .update(patch)
    .eq("org_id", orgId)
    .eq("id", id)
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("cuil_duplicado");
    throw error;
  }
  return data;
}

export async function countEmpleadosActivos(orgId: string): Promise<number> {
  const service = createServiceClient();
  const { count, error } = await service
    .from("empleados")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .neq("estado", "baja");
  if (error) throw error;
  return count ?? 0;
}

export async function getEmpleadoScoped(orgId: string, id: string): Promise<Empleado | null> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("empleados")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function tieneAsistencia(orgId: string, empleadoId: string): Promise<boolean> {
  const service = createServiceClient();
  const { count, error } = await service
    .from("asistencia")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("empleado_id", empleadoId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function deleteEmpleado(orgId: string, id: string): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.from("empleados").delete().eq("org_id", orgId).eq("id", id);
  if (error) throw error;
}

export async function getEmpleadoById(id: string): Promise<Empleado | null> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("empleados")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getEmpleadoByToken(token: string): Promise<Empleado | null> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("empleados")
    .select("*")
    .eq("device_token", token)
    .in("estado", ["activo", "de_licencia"])
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getEmpleadoByDeviceToken(
  orgId: string,
  token: string
): Promise<Empleado | null> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("empleados")
    .select("*")
    .eq("org_id", orgId)
    .eq("device_token", token)
    .in("estado", ["activo", "de_licencia"])
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function vincularDispositivo(
  orgId: string,
  empleadoId: string,
  token: string
): Promise<void> {
  const service = createServiceClient();
  const { error } = await service
    .from("empleados")
    .update({ device_token: token })
    .eq("org_id", orgId)
    .eq("id", empleadoId);
  if (error) throw error;
}

export async function desvincularDispositivo(orgId: string, empleadoId: string): Promise<void> {
  const service = createServiceClient();
  const { error } = await service
    .from("empleados")
    .update({ device_token: null })
    .eq("org_id", orgId)
    .eq("id", empleadoId);
  if (error) throw error;
}

export interface ResultadoNomina {
  empleado: Empleado;
  exacto: boolean;
}

export async function buscarEnNomina(
  orgId: string,
  input: string
): Promise<ResultadoNomina | null> {
  const service = createServiceClient();
  const { data: activos, error } = await service
    .from("empleados")
    .select("*")
    .eq("org_id", orgId)
    .in("estado", ["activo", "de_licencia"]);
  if (error) throw error;

  const nombreCompleto = (e: Empleado) => `${e.apellido ?? ""} ${e.nombre}`.trim();
  const nombres = activos.map(nombreCompleto);

  const exacto = validarEmpleado(nombres, input);
  if (exacto) {
    return { empleado: activos.find((e) => nombreCompleto(e) === exacto)!, exacto: true };
  }

  const parecido = buscarEmpleadoParecido(nombres, input);
  if (parecido) {
    return { empleado: activos.find((e) => nombreCompleto(e) === parecido)!, exacto: false };
  }

  return null;
}
