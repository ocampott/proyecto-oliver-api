import { z } from "zod";

export const crearManualSchema = z.object({
  empleadoId: z.string().trim().min(1),
  sucursalId: z.string().trim().min(1),
  tipo: z.enum(["entrada", "salida"]),
  fechaHora: z.string().trim().min(1),
});

export const editarAsistenciaSchema = z.object({
  empleadoId: z.string().trim().min(1).optional(),
  sucursalId: z.string().trim().min(1).optional(),
  tipo: z.enum(["entrada", "salida"]).optional(),
  fechaHora: z.string().trim().min(1).optional(),
});
