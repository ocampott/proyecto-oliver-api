import { z } from "zod";

export const crearAdelantoSchema = z.object({
  empleadoId: z.string().trim().min(1),
  fecha: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  monto: z.number().positive(),
  nota: z.string().trim().max(500).optional().nullable(),
});

export const configTopeSchema = z.object({
  tipo: z.enum(["porcentaje", "monto_fijo", "sin_tope"]),
  valor: z.number().min(0),
});
