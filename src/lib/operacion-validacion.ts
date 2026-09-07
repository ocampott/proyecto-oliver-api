import { z } from "zod";

export const rangoSchema = z.object({
  desde: z.iso.date(),
  hasta: z.iso.date(),
}).refine((v) => v.desde <= v.hasta && (Date.parse(v.hasta) - Date.parse(v.desde)) / 86400000 < 366,
  "El período debe estar ordenado y abarcar como máximo 366 días.");

export const decisionSchema = z.object({
  estado: z.enum(["aprobada", "rechazada"]),
  revision: z.number().int().positive(),
  comentario: z.string().trim().min(3).max(1000),
});
export const cierreSchema = rangoSchema.safeExtend({
  revision: z.uuid(),
  nota: z.string().trim().min(3).max(1000),
});
export class OperacionError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function validarRango(input: unknown) {
  const result = rangoSchema.safeParse(input);
  if (!result.success) throw new OperacionError(400, "Seleccioná un rango válido de hasta 366 días.");
  return result.data;
}
