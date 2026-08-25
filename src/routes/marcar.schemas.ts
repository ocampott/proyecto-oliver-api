import { z } from "zod";

export const identificarSchema = z.object({
  orgSlug: z.string().trim().min(1),
  sucursalId: z.string().trim().min(1),
  nombre: z.string().trim().min(1),
});

export const verificarSchema = z.object({
  empleadoId: z.string().trim().min(1),
  code: z.string().trim().min(1),
});

export const registrarSchema = z.object({
  sucursalId: z.string().trim().min(1),
  tipo: z.enum(["entrada", "salida"]),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});
