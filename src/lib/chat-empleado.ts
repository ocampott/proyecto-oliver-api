import { createServiceClient } from "./supabase-service.js";
import { insertAusencia, listAusencias, getRrhhCategorias } from "./rrhh.js";
import { calcularSaldoVacaciones } from "./vacaciones.js";
import { guardarLegajoArchivo, marcarCertificadoEntregado } from "./legajos.js";
import { nombreCompleto, type Empleado } from "./empleados.js";

// ── Chat web de RRHH ──────────────────────────────────────────────────────
// Puerto del flujo conversacional de handleRRHH (repo de referencia, que
// corría sobre WhatsApp) a un chat dentro del panel web. Sin nombre/sucursal
// (ya resueltos por el device token — ver requireDeviceEmpleado) y sin
// resumen por LLM (se guarda el texto tal cual lo escribe el empleado).

type Step =
  | "menu"
  | "ausencia_motivo"
  | "enfermedad_cert"
  | "fecha_inicio"
  | "fecha_fin"
  | "datos"
  | "certificado_elegir"
  | "certificado_esperando_archivo"
  | "cierre";

interface ChatData {
  categoria?: string;
  certificado?: boolean;
  fechaInicio?: string;
  fechaFin?: string;
  ausenciaId?: string;
}

interface Estado {
  step: Step;
  data: ChatData;
}

export interface Opcion {
  value: string;
  label: string;
}

export type TipoEntrada = "menu" | "fecha" | "texto" | "archivo";

export interface ChatRespuesta {
  mensajes: string[];
  paso: Step;
  entrada: TipoEntrada;
  opciones?: Opcion[];
}

const TTL_MS = 30 * 60 * 1000;

const MENU_OPCIONES: Opcion[] = [
  { value: "1", label: "Notificar ausencia o certificado" },
  { value: "2", label: "Solicitar vacaciones" },
  { value: "3", label: "Avisar una urgencia" },
  { value: "4", label: "Entregar certificado pendiente" },
];

function saludo(nombre: string): string {
  return `¡Hola, ${nombre}! Soy el asistente de RRHH. ¿En qué te puedo ayudar?`;
}

const MENU_MSG = "Elegí una opción:";

function menuRespuesta(mensajes: string[]): ChatRespuesta {
  return { mensajes, paso: "menu", entrada: "menu", opciones: MENU_OPCIONES };
}

// ── Persistencia de estado y mensajes ────────────────────────────────────

async function getEstado(empleadoId: string): Promise<Estado | null> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("rrhh_chat_estado")
    .select("step, data, updated_at")
    .eq("empleado_id", empleadoId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (Date.now() - new Date(data.updated_at).getTime() > TTL_MS) return null;
  return { step: data.step as Step, data: data.data as ChatData };
}

async function setEstado(orgId: string, empleadoId: string, step: Step, data: ChatData): Promise<void> {
  const service = createServiceClient();
  const { error } = await service
    .from("rrhh_chat_estado")
    .upsert({ empleado_id: empleadoId, org_id: orgId, step, data, updated_at: new Date().toISOString() });
  if (error) throw error;
}

async function registrarMensaje(
  orgId: string,
  empleadoId: string,
  remitente: "empleado" | "sistema",
  texto: string
): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.from("rrhh_chat_mensajes").insert({ org_id: orgId, empleado_id: empleadoId, remitente, texto });
  if (error) throw error;
}

export interface MensajeHistorial {
  remitente: "empleado" | "sistema";
  texto: string;
  created_at: string;
}

export async function obtenerHistorial(
  orgId: string,
  empleado: Empleado
): Promise<{ mensajes: MensajeHistorial[]; paso: Step; entrada: TipoEntrada; opciones?: Opcion[] }> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("rrhh_chat_mensajes")
    .select("remitente, texto, created_at")
    .eq("empleado_id", empleado.id)
    .order("created_at", { ascending: true });
  if (error) throw error;

  let historial = data as MensajeHistorial[];
  let estado = await getEstado(empleado.id);

  if (historial.length === 0 || !estado) {
    // Primer contacto (o inactividad > 30 min): saludo + menú.
    const nombre = nombreCompleto(empleado);
    await registrarMensaje(orgId, empleado.id, "sistema", saludo(nombre));
    await registrarMensaje(orgId, empleado.id, "sistema", MENU_MSG);
    await setEstado(orgId, empleado.id, "menu", {});
    historial = [
      { remitente: "sistema", texto: saludo(nombre), created_at: new Date().toISOString() },
      { remitente: "sistema", texto: MENU_MSG, created_at: new Date().toISOString() },
    ];
    estado = { step: "menu", data: {} };
  }

  const { entrada, opciones } = await entradaEsperada(orgId, estado);
  return { mensajes: historial, paso: estado.step, entrada, opciones };
}

async function entradaEsperada(orgId: string, estado: Estado): Promise<{ entrada: TipoEntrada; opciones?: Opcion[] }> {
  switch (estado.step) {
    case "menu":
      return { entrada: "menu", opciones: MENU_OPCIONES };
    case "ausencia_motivo":
      return { entrada: "menu", opciones: await opcionesMotivo(orgId) };
    case "enfermedad_cert":
      return {
        entrada: "menu",
        opciones: [
          { value: "1", label: "Sí, tengo certificado" },
          { value: "2", label: "No tengo certificado" },
        ],
      };
    case "fecha_inicio":
    case "fecha_fin":
      return { entrada: "fecha" };
    case "datos":
      return { entrada: "texto" };
    case "certificado_elegir":
      return { entrada: "menu" }; // opciones se arman al entrar al paso, ver procesarMensaje
    case "certificado_esperando_archivo":
      return { entrada: "archivo" };
    case "cierre":
      return {
        entrada: "menu",
        opciones: [
          { value: "1", label: "Hacer otra consulta" },
          { value: "2", label: "Listo, gracias" },
        ],
      };
  }
}

async function opcionesMotivo(orgId: string): Promise<Opcion[]> {
  const categorias = await getRrhhCategorias(orgId);
  const filtradas = categorias.filter((c) => !["vacaciones", "urgencia"].includes(c.trim().toLowerCase()));
  return filtradas.map((c, i) => ({ value: String(i + 1), label: c }));
}

// ── Fechas ────────────────────────────────────────────────────────────────

function esFechaValida(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

function diasEntreISO(desdeISO: string, hastaISO: string): number {
  return Math.round((Date.parse(`${hastaISO}T00:00:00Z`) - Date.parse(`${desdeISO}T00:00:00Z`)) / 86400000) + 1;
}

// ── Handler principal ───────────────────────────────────────────────────

export async function procesarMensaje(orgId: string, empleado: Empleado, texto: string): Promise<ChatRespuesta> {
  const raw = texto.trim();
  await registrarMensaje(orgId, empleado.id, "empleado", raw);

  let estado = (await getEstado(empleado.id)) ?? { step: "menu" as Step, data: {} };

  if (raw.toLowerCase() === "cancelar") {
    await setEstado(orgId, empleado.id, "menu", {});
    return responder(orgId, empleado.id, menuRespuesta(["Listo, cancelé la operación."]));
  }

  switch (estado.step) {
    case "menu": {
      if (raw === "1") {
        await setEstado(orgId, empleado.id, "ausencia_motivo", {});
        const opciones = await opcionesMotivo(orgId);
        return responder(orgId, empleado.id, {
          mensajes: ["Seleccioná el motivo de tu ausencia:"],
          paso: "ausencia_motivo",
          entrada: "menu",
          opciones,
        });
      }
      if (raw === "2") {
        await setEstado(orgId, empleado.id, "fecha_inicio", { categoria: "Vacaciones" });
        return responder(orgId, empleado.id, {
          mensajes: ["¿Qué día empezarían tus vacaciones?"],
          paso: "fecha_inicio",
          entrada: "fecha",
        });
      }
      if (raw === "3") {
        await setEstado(orgId, empleado.id, "datos", { categoria: "Urgencia" });
        return responder(orgId, empleado.id, {
          mensajes: ["Contame en un mensaje cuál es la urgencia y lo derivo a RRHH de inmediato."],
          paso: "datos",
          entrada: "texto",
        });
      }
      if (raw === "4") {
        return await iniciarEntregaCertificado(orgId, empleado);
      }
      return responder(orgId, empleado.id, menuRespuesta(["No reconocí esa opción."]));
    }

    case "ausencia_motivo": {
      const opciones = await opcionesMotivo(orgId);
      const elegido = opciones.find((o) => o.value === raw);
      if (!elegido) {
        return responder(orgId, empleado.id, {
          mensajes: ["No reconocí esa opción."],
          paso: "ausencia_motivo",
          entrada: "menu",
          opciones,
        });
      }
      if (elegido.label.trim().toLowerCase() === "enfermedad") {
        await setEstado(orgId, empleado.id, "enfermedad_cert", { categoria: elegido.label });
        return responder(orgId, empleado.id, {
          mensajes: ["¿Contás con el certificado médico correspondiente?"],
          paso: "enfermedad_cert",
          entrada: "menu",
          opciones: [
            { value: "1", label: "Sí, tengo certificado" },
            { value: "2", label: "No tengo certificado" },
          ],
        });
      }
      await setEstado(orgId, empleado.id, "fecha_inicio", { categoria: elegido.label });
      return responder(orgId, empleado.id, {
        mensajes: ["¿Qué día empieza (o empezó) la ausencia?"],
        paso: "fecha_inicio",
        entrada: "fecha",
      });
    }

    case "enfermedad_cert": {
      if (raw !== "1" && raw !== "2") {
        return responder(orgId, empleado.id, {
          mensajes: ["Elegí una opción válida."],
          paso: "enfermedad_cert",
          entrada: "menu",
          opciones: [
            { value: "1", label: "Sí, tengo certificado" },
            { value: "2", label: "No tengo certificado" },
          ],
        });
      }
      await setEstado(orgId, empleado.id, "fecha_inicio", { ...estado.data, certificado: raw === "1" });
      return responder(orgId, empleado.id, {
        mensajes: ["¿Qué día empieza (o empezó) la ausencia?"],
        paso: "fecha_inicio",
        entrada: "fecha",
      });
    }

    case "fecha_inicio": {
      if (!esFechaValida(raw)) {
        return responder(orgId, empleado.id, { mensajes: ["Esa fecha no es válida."], paso: "fecha_inicio", entrada: "fecha" });
      }
      await setEstado(orgId, empleado.id, "fecha_fin", { ...estado.data, fechaInicio: raw });
      return responder(orgId, empleado.id, { mensajes: ["¿Y hasta qué día? Si es un solo día, poné la misma fecha."], paso: "fecha_fin", entrada: "fecha" });
    }

    case "fecha_fin": {
      if (!esFechaValida(raw) || raw < (estado.data.fechaInicio as string)) {
        return responder(orgId, empleado.id, {
          mensajes: ["Esa fecha no es válida (no puede ser anterior al inicio)."],
          paso: "fecha_fin",
          entrada: "fecha",
        });
      }
      await setEstado(orgId, empleado.id, "datos", { ...estado.data, fechaFin: raw });
      return responder(orgId, empleado.id, {
        mensajes: ["Contame en un mensaje una breve descripción del motivo."],
        paso: "datos",
        entrada: "texto",
      });
    }

    case "datos": {
      return await finalizarReporte(orgId, empleado, estado.data, raw);
    }

    case "certificado_elegir": {
      const pendientes = await pendientesDeCertificado(orgId, empleado.id);
      const idx = Number(raw) - 1;
      const elegido = Number.isInteger(idx) ? pendientes[idx] : undefined;
      if (!elegido) {
        return responder(orgId, empleado.id, {
          mensajes: ["No reconocí esa opción."],
          paso: "certificado_elegir",
          entrada: "menu",
          opciones: pendientes.map((p, i) => ({ value: String(i + 1), label: `Del aviso del ${p.fecha_desde}` })),
        });
      }
      await setEstado(orgId, empleado.id, "certificado_esperando_archivo", { ausenciaId: elegido.id });
      return responder(orgId, empleado.id, {
        mensajes: ["Perfecto. Adjuntá ahora el archivo (foto o PDF) del certificado médico."],
        paso: "certificado_esperando_archivo",
        entrada: "archivo",
      });
    }

    case "certificado_esperando_archivo": {
      return responder(orgId, empleado.id, {
        mensajes: ["Todavía estoy esperando el archivo del certificado."],
        paso: "certificado_esperando_archivo",
        entrada: "archivo",
      });
    }

    case "cierre": {
      if (raw === "1") {
        await setEstado(orgId, empleado.id, "menu", {});
        return responder(orgId, empleado.id, menuRespuesta(["Elegí una opción:"]));
      }
      await setEstado(orgId, empleado.id, "menu", {});
      return responder(orgId, empleado.id, {
        mensajes: ["¡Gracias por avisar! Cuando necesites algo más, escribime."],
        paso: "menu",
        entrada: "menu",
        opciones: MENU_OPCIONES,
      });
    }
  }
}

async function pendientesDeCertificado(orgId: string, empleadoId: string) {
  const ausencias = await listAusencias(orgId, { empleadoId });
  return ausencias.filter((a) => a.certificado_pendiente && a.estado !== "rechazada");
}

async function iniciarEntregaCertificado(orgId: string, empleado: Empleado): Promise<ChatRespuesta> {
  const pendientes = await pendientesDeCertificado(orgId, empleado.id);
  if (pendientes.length === 0) {
    await setEstado(orgId, empleado.id, "menu", {});
    return responder(orgId, empleado.id, menuRespuesta(["No tenés ningún certificado médico pendiente registrado."]));
  }
  if (pendientes.length === 1) {
    await setEstado(orgId, empleado.id, "certificado_esperando_archivo", { ausenciaId: pendientes[0].id });
    return responder(orgId, empleado.id, {
      mensajes: [`Encontré tu ausencia del ${pendientes[0].fecha_desde} con certificado pendiente. Adjuntá el archivo (foto o PDF).`],
      paso: "certificado_esperando_archivo",
      entrada: "archivo",
    });
  }
  await setEstado(orgId, empleado.id, "certificado_elegir", {});
  return responder(orgId, empleado.id, {
    mensajes: [`Tenés ${pendientes.length} certificados pendientes. ¿Cuál vas a entregar?`],
    paso: "certificado_elegir",
    entrada: "menu",
    opciones: pendientes.map((p, i) => ({ value: String(i + 1), label: `Del aviso del ${p.fecha_desde}` })),
  });
}

async function finalizarReporte(orgId: string, empleado: Empleado, data: ChatData, textoLibre: string): Promise<ChatRespuesta> {
  const categoria = data.categoria as string;

  if (categoria === "Urgencia") {
    // Sin rango de fechas, no genera una fila en `ausencias` — queda en el
    // historial del chat, marcado para que RRHH lo vea como aviso urgente
    // (ver "Avisos recientes" en /rrhh, filtra por este prefijo).
    await registrarMensaje(orgId, empleado.id, "sistema", `⚠️ URGENCIA de ${nombreCompleto(empleado)}: ${textoLibre}`);
    await setEstado(orgId, empleado.id, "cierre", {});
    return responder(orgId, empleado.id, {
      mensajes: ["Avisé a RRHH sobre tu urgencia. Se van a comunicar a la brevedad.", "¿Necesitás algo más?"],
      paso: "cierre",
      entrada: "menu",
      opciones: [
        { value: "1", label: "Hacer otra consulta" },
        { value: "2", label: "Listo, gracias" },
      ],
    });
  }

  let detalle = textoLibre;
  if (categoria === "Vacaciones" && data.fechaInicio && data.fechaFin) {
    const diasPedidos = diasEntreISO(data.fechaInicio, data.fechaFin);
    const anioPedido = Number(data.fechaInicio.slice(0, 4));
    const saldos = await calcularSaldoVacaciones(orgId, anioPedido);
    const saldoInfo = saldos.find((s) => s.empleado_id === empleado.id);
    if (saldoInfo && saldoInfo.saldo !== null && diasPedidos > saldoInfo.saldo) {
      detalle += ` ⚠️ SALDO INSUFICIENTE: pide ${diasPedidos} días, le quedan ${saldoInfo.saldo}.`;
    }
  }

  const certificadoPendiente = categoria === "Enfermedad";
  const ausenciaId = await insertAusencia(orgId, {
    empleado_id: empleado.id,
    fecha_desde: data.fechaInicio as string,
    fecha_hasta: data.fechaFin as string,
    motivo: categoria,
    detalle,
    certificado_pendiente: certificadoPendiente,
    origen: "empleado",
  });

  if (categoria === "Enfermedad" && data.certificado === true) {
    await setEstado(orgId, empleado.id, "certificado_esperando_archivo", { ausenciaId });
    return responder(orgId, empleado.id, {
      mensajes: ["Tu solicitud quedó pendiente de revisión por RRHH.", "Ahora adjuntá el archivo (foto o PDF) de tu certificado médico."],
      paso: "certificado_esperando_archivo",
      entrada: "archivo",
    });
  }

  await setEstado(orgId, empleado.id, "cierre", {});
  const mensajeFinal =
    categoria === "Enfermedad" && data.certificado === false
      ? "Tu solicitud quedó pendiente de revisión por RRHH. Es importante que presentes el certificado médico a la brevedad — podés hacerlo cuando quieras desde \"Entregar certificado pendiente\"."
      : "Tu solicitud quedó pendiente de revisión por RRHH. Podés consultar su estado en Mi información.";
  return responder(orgId, empleado.id, {
    mensajes: [mensajeFinal, "¿Necesitás algo más?"],
    paso: "cierre",
    entrada: "menu",
    opciones: [
      { value: "1", label: "Hacer otra consulta" },
      { value: "2", label: "Listo, gracias" },
    ],
  });
}

export async function procesarCertificado(
  orgId: string,
  empleado: Empleado,
  archivo: { buffer: Buffer; nombreOriginal: string; mimetype: string }
): Promise<ChatRespuesta> {
  const estado = await getEstado(empleado.id);
  if (!estado || estado.step !== "certificado_esperando_archivo" || !estado.data.ausenciaId) {
    return responder(orgId, empleado.id, menuRespuesta(["No estoy esperando ningún archivo ahora mismo."]));
  }

  await guardarLegajoArchivo(orgId, {
    empleadoId: empleado.id,
    nombreOriginal: archivo.nombreOriginal,
    buffer: archivo.buffer,
    mimetype: archivo.mimetype,
    origen: "chat_empleado",
    ausenciaId: estado.data.ausenciaId,
  });
  await marcarCertificadoEntregado(orgId, estado.data.ausenciaId);
  await registrarMensaje(orgId, empleado.id, "empleado", `📎 ${archivo.nombreOriginal}`);
  await setEstado(orgId, empleado.id, "cierre", {});

  return responder(orgId, empleado.id, {
    mensajes: ["Recibí el certificado, gracias. ✅", "¿Necesitás algo más?"],
    paso: "cierre",
    entrada: "menu",
    opciones: [
      { value: "1", label: "Hacer otra consulta" },
      { value: "2", label: "Listo, gracias" },
    ],
  });
}

// ── Avisos urgentes (para RRHH) ──────────────────────────────────────────
// Las Urgencias reportadas por chat no generan una fila en `ausencias` (no
// tienen rango de fechas) — quedan en rrhh_chat_mensajes con este prefijo
// fijo, que es lo que filtra la sección "Avisos recientes" de /rrhh.
export interface AvisoUrgente {
  empleado_id: string;
  empleado_nombre: string;
  texto: string;
  created_at: string;
}

const PREFIJO_URGENCIA = "⚠️ URGENCIA";

export async function listAvisosUrgentes(orgId: string, limit = 20): Promise<AvisoUrgente[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("rrhh_chat_mensajes")
    .select("empleado_id, texto, created_at, empleados(nombre, apellido)")
    .eq("org_id", orgId)
    .eq("remitente", "sistema")
    .like("texto", `${PREFIJO_URGENCIA}%`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = data as {
    empleado_id: string;
    texto: string;
    created_at: string;
    empleados: { nombre: string; apellido: string | null } | { nombre: string; apellido: string | null }[] | null;
  }[];
  return rows.map((r) => {
    const rel = Array.isArray(r.empleados) ? r.empleados[0] : r.empleados;
    return {
      empleado_id: r.empleado_id,
      empleado_nombre: rel ? nombreCompleto(rel) : "?",
      texto: r.texto,
      created_at: r.created_at,
    };
  });
}

async function responder(orgId: string, empleadoId: string, respuesta: ChatRespuesta): Promise<ChatRespuesta> {
  for (const m of respuesta.mensajes) {
    await registrarMensaje(orgId, empleadoId, "sistema", m);
  }
  return respuesta;
}
