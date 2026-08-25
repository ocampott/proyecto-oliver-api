import { describe, expect, it } from "vitest";
import { dentroDeGeocerca, haversineMetros } from "./geo.js";

describe("haversineMetros", () => {
  it("da 0 cuando los dos puntos son el mismo", () => {
    expect(haversineMetros(-34.6037, -58.3816, -34.6037, -58.3816)).toBe(0);
  });

  it("calcula la distancia real entre Obelisco y Congreso (~1.18km)", () => {
    // Obelisco: -34.6037,-58.3816 · Congreso: -34.6095,-58.3924
    const distancia = haversineMetros(-34.6037, -58.3816, -34.6095, -58.3924);
    expect(distancia).toBeGreaterThan(1100);
    expect(distancia).toBeLessThan(1250);
  });

  it("es simétrica", () => {
    const a = haversineMetros(-34.6, -58.4, -34.61, -58.41);
    const b = haversineMetros(-34.61, -58.41, -34.6, -58.4);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe("dentroDeGeocerca", () => {
  const sucursal = { lat: -34.6037, lon: -58.3816, radio_metros: 100 };

  it("acepta una marca en el centro exacto de la sucursal", () => {
    const r = dentroDeGeocerca(sucursal, sucursal.lat, sucursal.lon);
    expect(r.ok).toBe(true);
    expect(r.distancia).toBe(0);
  });

  it("rechaza una marca bien afuera del radio", () => {
    // ~1km al sur
    const r = dentroDeGeocerca(sucursal, -34.6127, sucursal.lon);
    expect(r.ok).toBe(false);
    expect(r.distancia).toBeGreaterThan(sucursal.radio_metros);
  });

  it("acepta justo en el borde del radio", () => {
    // Punto construido para caer dentro del radio (distancia < radio)
    const r = dentroDeGeocerca(sucursal, sucursal.lat + 0.0005, sucursal.lon);
    expect(r.distancia).toBeLessThan(sucursal.radio_metros);
    expect(r.ok).toBe(true);
  });
});
