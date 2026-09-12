import { createServiceClient } from "./supabase-service.js";
import { getEmpleadoById, nombreCompleto } from "./empleados.js";

export interface Adelanto {
  id: string;
  org_id: string;
  empleado_id: string;
  empleado_nombre: string;
  fecha: string;
  monto: number;
  nota: string | null;
  created_at: string;
}

export async function listAdelantos(
  orgId: string,
  filters: { desde?: string; hasta?: string; empleadoId?: string } = {}
): Promise<Adelanto[]> {
  const service = createServiceClient();
  let query = service
    .from("adelantos")
    .select("*, empleados(nombre, apellido)")
    .eq("org_id", orgId)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });
  if (filters.desde) query = query.gte("fecha", filters.desde);
  if (filters.hasta) query = query.lte("fecha", filters.hasta);
  if (filters.empleadoId) query = query.eq("empleado_id", filters.empleadoId);

  const { data, error } = await query;
  if (error) throw error;

  return data.map((r) => {
    const emp = Array.isArray(r.empleados) ? r.empleados[0] : r.empleados;
    return {
      id: r.id,
      org_id: r.org_id,
      empleado_id: r.empleado_id,
      empleado_nombre: emp ? nombreCompleto(emp) : "?",
      fecha: r.fecha,
      monto: r.monto,
      nota: r.nota,
      created_at: r.created_at,
    };
  });
}

export async function crearAdelanto(
  orgId: string,
  input: { empleadoId: string; fecha: string; monto: number; nota?: string | null }
): Promise<Adelanto> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("adelantos")
    .insert({
      org_id: orgId,
      empleado_id: input.empleadoId,
      fecha: input.fecha,
      monto: input.monto,
      nota: input.nota ?? null,
    })
    .select("*, empleados(nombre, apellido)")
    .single();
  if (error) throw error;

  const emp = Array.isArray(data.empleados) ? data.empleados[0] : data.empleados;
  return {
    id: data.id,
    org_id: data.org_id,
    empleado_id: data.empleado_id,
    empleado_nombre: emp ? nombreCompleto(emp) : "?",
    fecha: data.fecha,
    monto: data.monto,
    nota: data.nota,
    created_at: data.created_at,
  };
}

export async function deleteAdelanto(orgId: string, id: string): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.from("adelantos").delete().eq("org_id", orgId).eq("id", id);
  if (error) throw error;
}

export type TipoTopeAdelanto = "porcentaje" | "monto_fijo" | "sin_tope";

export interface TopeAdelantoConfig {
  tipo: TipoTopeAdelanto;
  /** Porcentaje (0-100) si tipo="porcentaje", pesos si tipo="monto_fijo". Ignorado si "sin_tope". */
  valor: number;
}

/**
 * Configuración del tope de adelantos de la org — vive en org_settings,
 * mismo patrón que getTolerancia/setTolerancia (turnos.ts) en vez de una
 * tabla "settings" propia. Editable a mano por el owner/admin (antes era
 * un 20% fijo del sueldo mensual, hardcodeado).
 */
export async function getTopeConfig(orgId: string): Promise<TopeAdelantoConfig> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("org_settings")
    .select("tope_adelanto_tipo, tope_adelanto_valor")
    .eq("org_id", orgId)
    .single();
  if (error) throw error;
  return { tipo: data.tope_adelanto_tipo, valor: data.tope_adelanto_valor };
}

export async function setTopeConfig(orgId: string, config: TopeAdelantoConfig): Promise<void> {
  const service = createServiceClient();
  const { error } = await service
    .from("org_settings")
    .update({ tope_adelanto_tipo: config.tipo, tope_adelanto_valor: config.valor })
    .eq("org_id", orgId);
  if (error) throw error;
}

export interface TopeAdelanto {
  tipo: TipoTopeAdelanto;
  /** null si tipo="sin_tope", o si tipo="porcentaje" y el empleado no es
   * mensual / no tiene sueldo cargado (no se puede derivar el %). */
  limite: number | null;
  /** Suma de adelantos ya cargados en el mes de `fecha` (sin contar uno nuevo). */
  usado: number;
  disponible: number | null;
  excedido: boolean;
}

function limitesDelMes(fechaISO: string): { desde: string; hasta: string } {
  const [anio, mes] = fechaISO.split("-").map(Number);
  const desde = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const hasta = `${anio}-${String(mes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;
  return { desde, hasta };
}

/**
 * Estado del tope mensual de adelantos para un empleado, a la fecha dada —
 * se usa tanto para validar un adelanto nuevo (aviso no bloqueante) como
 * para mostrarlo de referencia en el formulario antes de cargarlo.
 * "porcentaje" solo se puede calcular para empleados `tipo_pago: "mensual"`
 * (por hora/día no hay un sueldo fijo del cual derivar el %); "monto_fijo"
 * aplica igual a cualquier tipo de pago.
 */
export async function calcularTopeAdelanto(orgId: string, empleadoId: string, fecha: string): Promise<TopeAdelanto> {
  const config = await getTopeConfig(orgId);

  let limite: number | null;
  if (config.tipo === "sin_tope") {
    limite = null;
  } else if (config.tipo === "monto_fijo") {
    limite = config.valor;
  } else {
    const empleado = await getEmpleadoById(empleadoId);
    const sueldo = empleado && empleado.org_id === orgId && empleado.tipo_pago === "mensual" ? empleado.sueldo_mensual : null;
    limite = sueldo !== null ? sueldo * (config.valor / 100) : null;
  }

  const { desde, hasta } = limitesDelMes(fecha);
  const yaCargados = await listAdelantos(orgId, { empleadoId, desde, hasta });
  const usado = yaCargados.reduce((acc, a) => acc + a.monto, 0);

  return {
    tipo: config.tipo,
    limite,
    usado,
    disponible: limite !== null ? limite - usado : null,
    excedido: limite !== null && usado > limite,
  };
}
