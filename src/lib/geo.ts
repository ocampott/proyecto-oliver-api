// Geocerca: fórmula Haversine tal cual del sistema viejo
// (src/lib/baileys/handler.ts, commit bf39781).

export function haversineMetros(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface Geocerca {
  lat: number;
  lon: number;
  radio_metros: number;
}

export function dentroDeGeocerca(
  sucursal: Geocerca,
  lat: number,
  lon: number
): { ok: boolean; distancia: number } {
  const distancia = haversineMetros(lat, lon, sucursal.lat, sucursal.lon);
  return { ok: distancia <= sucursal.radio_metros, distancia };
}
