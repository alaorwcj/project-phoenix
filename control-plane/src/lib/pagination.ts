/**
 * Pagination utilities for list endpoints.
 * Supports limit/offset parameters with sensible defaults/limits.
 */

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface PaginationMeta {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 500;
const DEFAULT_OFFSET = 0;

/**
 * Parse and validate pagination params from query string.
 * Returns clamped limit and offset, plus a where clause for Prisma.
 */
export function parsePaginationParams(
  query: Record<string, unknown> | undefined
): { limit: number; offset: number } {
  const limit = Math.min(
    Math.max(Number((query?.limit as string | undefined) ?? DEFAULT_LIMIT), 1),
    MAX_LIMIT
  );
  const offset = Math.max(Number((query?.offset as string | undefined) ?? DEFAULT_OFFSET), 0);
  return { limit, offset };
}

/**
 * Build paginated response with metadata.
 */
export function buildPaginatedResponse<T>(
  data: T[],
  limit: number,
  offset: number,
  total: number
): PaginatedResponse<T> {
  return {
    data,
    pagination: {
      limit,
      offset,
      total,
      hasMore: offset + limit < total,
    },
  };
}
