import { describe, expect, it } from "vitest";
import { parsePagination, rangeFor, buildMeta, PAGE_SIZES } from "./pagination.js";

describe("parsePagination", () => {
  it("usa page=1 y pageSize=20 por default sin query params", () => {
    expect(parsePagination({})).toEqual({ page: 1, pageSize: 20 });
  });

  it("acepta page y pageSize válidos", () => {
    expect(parsePagination({ page: "3", pageSize: "10" })).toEqual({ page: 3, pageSize: 10 });
  });

  it("clampea page inválido (negativo, cero, no numérico) a 1", () => {
    expect(parsePagination({ page: "-5" }).page).toBe(1);
    expect(parsePagination({ page: "0" }).page).toBe(1);
    expect(parsePagination({ page: "abc" }).page).toBe(1);
  });

  it("clampea pageSize fuera de [10,20,30] al default (20)", () => {
    expect(parsePagination({ pageSize: "50" }).pageSize).toBe(20);
    expect(parsePagination({ pageSize: "0" }).pageSize).toBe(20);
    expect(parsePagination({ pageSize: "abc" }).pageSize).toBe(20);
  });

  it("acepta los tres tamaños permitidos", () => {
    for (const size of PAGE_SIZES) {
      expect(parsePagination({ pageSize: String(size) }).pageSize).toBe(size);
    }
  });
});

describe("rangeFor", () => {
  it("página 1 con pageSize 20 → from 0, to 19", () => {
    expect(rangeFor({ page: 1, pageSize: 20 })).toEqual({ from: 0, to: 19 });
  });

  it("página 3 con pageSize 10 → from 20, to 29", () => {
    expect(rangeFor({ page: 3, pageSize: 10 })).toEqual({ from: 20, to: 29 });
  });
});

describe("buildMeta", () => {
  it("calcula totalPages redondeando hacia arriba", () => {
    expect(buildMeta({ page: 1, pageSize: 20 }, 45)).toEqual({
      page: 1,
      pageSize: 20,
      total: 45,
      totalPages: 3,
    });
  });

  it("total=0 da totalPages=1, no 0 (para no romper la UI de paginado)", () => {
    expect(buildMeta({ page: 1, pageSize: 20 }, 0).totalPages).toBe(1);
  });

  it("total múltiplo exacto de pageSize no suma una página de más", () => {
    expect(buildMeta({ page: 1, pageSize: 20 }, 40).totalPages).toBe(2);
  });
});
