// Paginado server-side puro — sin import de Supabase/env, mismo patrón que
// horas-calculo.ts/otp-logica.ts/cumplimiento-calculo.ts (spec §3.1).

export const PAGE_SIZES = [10, 20, 30] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
const DEFAULT_PAGE_SIZE: PageSize = 20;

export interface PaginationParams {
  page: number;
  pageSize: PageSize;
}

export interface PaginationMeta extends PaginationParams {
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: PaginationMeta;
}

function isPageSize(n: number): n is PageSize {
  return (PAGE_SIZES as readonly number[]).includes(n);
}

/**
 * Clampea page/pageSize a valores seguros en vez de rechazar con 400 — son
 * query params de UI (paginado), no datos de negocio que haya que validar
 * estrictamente.
 */
export function parsePagination(query: Record<string, unknown>): PaginationParams {
  const rawPage = Number(query.page);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  const rawPageSize = Number(query.pageSize);
  const pageSize = isPageSize(rawPageSize) ? rawPageSize : DEFAULT_PAGE_SIZE;

  return { page, pageSize };
}

export function rangeFor({ page, pageSize }: PaginationParams): { from: number; to: number } {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

export function buildMeta(params: PaginationParams, total: number): PaginationMeta {
  // Pica explícitamente page/pageSize en vez de spreadear params completo:
  // los callers (p.ej. listEmpleadosPaginado) suelen pasar un objeto más
  // grande que PaginationParams (con filtros de dominio como q/estado/...)
  // y esos campos no deben filtrarse al objeto `pagination` de la respuesta.
  return {
    page: params.page,
    pageSize: params.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}
