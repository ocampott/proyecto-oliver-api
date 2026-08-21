import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireOrg } from "../middleware/require-org.js";
import { env } from "../env.js";

interface DetailsBody {
  placeId?: string;
  sessionToken?: string;
}

interface GooglePlaceDetails {
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  addressComponents?: unknown[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Field mask mínima (SKU Essentials): nada de photos, rating, opening_hours.
const FIELD_MASK = "formattedAddress,location,addressComponents";

export const placesRouter = Router();

placesRouter.post("/places/details", requireAuth, requireOrg, async (req, res) => {
  const { placeId, sessionToken } = (req.body ?? {}) as DetailsBody;
  if (!placeId) {
    res.status(400).json({ error: "El placeId es requerido" });
    return;
  }
  if (!env.googleMapsApiKey) {
    res.status(500).json({ error: "Falta configurar GOOGLE_MAPS_API_KEY en el servidor" });
    return;
  }

  const params = new URLSearchParams({ languageCode: "es" });
  // El session token agrupa la sesión de autocomplete para billing;
  // solo lo reenviamos si es un UUID válido.
  if (sessionToken && UUID_RE.test(sessionToken)) {
    params.set("sessionToken", sessionToken);
  }

  const googleRes = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?${params}`,
    { headers: { "X-Goog-Api-Key": env.googleMapsApiKey, "X-Goog-FieldMask": FIELD_MASK } }
  );
  if (!googleRes.ok) {
    console.warn({ status: googleRes.status }, "Falló Place Details de Google");
    res.status(502).json({ error: "No pudimos resolver la dirección. Probá de nuevo." });
    return;
  }

  const data = (await googleRes.json()) as GooglePlaceDetails;
  res.json({
    formattedAddress: data.formattedAddress ?? null,
    lat: data.location?.latitude ?? null,
    lng: data.location?.longitude ?? null,
    addressComponents: data.addressComponents ?? [],
  });
});
