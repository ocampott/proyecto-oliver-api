import { z } from "zod";
import { validarCuil } from "../lib/cuil.js";
import { normalizarCelular } from "../lib/celular.js";

// Acepta "20-12345678-6" o "20123456786".
const cuilSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[.\-\s]/g, ""))
  .refine((v) => /^\d{11}$/.test(v), "El CUIL tiene que tener 11 dígitos")
  .refine(validarCuil, "CUIL inválido (el dígito verificador no coincide)");

const celularSchema = z
  .string()
  .trim()
  .min(1)
  .transform((v, ctx) => {
    const normalizado = normalizarCelular(v);
    if (normalizado === null) {
      ctx.addIssue({ code: "custom", message: "No reconocemos ese celular como un número argentino válido" });
      return z.NEVER;
    }
    return normalizado;
  });

export const crearEmpleadoSchema = z.object({
  nombre: z.string().trim().min(1),
  apellido: z.string().trim().min(1),
  celular: celularSchema.optional(),
  cuil: cuilSchema.optional(),
  fecha_ingreso: z.string().date().optional(),
  sucursal_id: z.string().trim().min(1).optional(),
});

export const editarEmpleadoSchema = z.object({
  nombre: z.string().trim().min(1).optional(),
  apellido: z.string().trim().min(1).optional(),
  celular: celularSchema.nullable().optional(),
  cuil: cuilSchema.nullable().optional(),
  fecha_ingreso: z.string().date().nullable().optional(),
  sucursal_id: z.string().trim().min(1).nullable().optional(),
  estado: z.enum(["activo", "de_licencia", "suspendido", "baja"]).optional(),
  tipo_pago: z.enum(["mensual", "hora", "dia"]).nullable().optional(),
  sueldo_mensual: z.number().nonnegative().nullable().optional(),
  valor_hora: z.number().nonnegative().nullable().optional(),
  valor_dia: z.number().nonnegative().nullable().optional(),
});
