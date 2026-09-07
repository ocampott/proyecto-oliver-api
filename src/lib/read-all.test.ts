import { it, expect, vi } from "vitest";
import { readAll } from "./read-all.js";
it("concatena páginas completas hasta agotar los datos", async () => {
  const page = vi.fn(async (from: number, to: number) => ({ data: [1, 2, 3, 4, 5].slice(from, to + 1), error: null }));
  expect(await readAll(page, 2)).toEqual([1, 2, 3, 4, 5]);
  expect(page).toHaveBeenCalledTimes(3);
});
it("no entrega resultados parciales ante errores", async () => {
  const page = vi.fn().mockResolvedValueOnce({ data: [1, 2], error: null }).mockResolvedValueOnce({ data: null, error: new Error("falló") });
  await expect(readAll(page, 2)).rejects.toThrow("falló");
});
