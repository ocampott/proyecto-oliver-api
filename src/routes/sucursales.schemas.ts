import { z } from "zod";

// Tope de geocerca: 5km ya es enorme para una sucursal (una planta grande
// entra de sobra). Sin tope, un radio absurdo (999999999m) apaga la
// geocerca en la práctica — spec §2.5.
const RADIO_METROS_MAX = 5000;

export const crearSucursalSchema = z.object({
  nombre: z.string().trim().min(1),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  radio_metros: z.number().positive().max(RADIO_METROS_MAX).optional(),
  direccion: z.string().trim().min(1).optional().nullable(),
});

export const editarSucursalSchema = z.object({
  nombre: z.string().trim().min(1).optional(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lon: z.number().min(-180).max(180).optional().nullable(),
  radio_metros: z.number().positive().max(RADIO_METROS_MAX).optional(),
  direccion: z.string().trim().min(1).optional().nullable(),
  activa: z.boolean().optional(),
});
