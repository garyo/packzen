/**
 * Helpers for staying inside Cloudflare D1's per-statement limits.
 */

import { getTableColumns, type Table } from 'drizzle-orm';
import { chunkArray } from './utils';

/** D1 rejects any statement that binds more than this many parameters. */
export const D1_MAX_BOUND_PARAMS = 100;

/**
 * Split rows for multi-row INSERTs into `table` so that no statement exceeds
 * D1's parameter limit. Drizzle binds up to one parameter per column per row.
 */
export function chunkRowsForInsert<T>(table: Table, rows: T[]): T[][] {
  const columnCount = Object.keys(getTableColumns(table)).length;
  return chunkArray(rows, Math.floor(D1_MAX_BOUND_PARAMS / columnCount));
}

/**
 * Run an `inArray(column, ids)` query in chunks that respect D1's parameter
 * limit. `otherParams` is how many values the rest of the query binds.
 */
export async function selectByIds<T>(
  ids: string[],
  otherParams: number,
  query: (ids: string[]) => Promise<T[]>
): Promise<T[]> {
  const chunks = chunkArray(ids, D1_MAX_BOUND_PARAMS - otherParams);
  return (await Promise.all(chunks.map(query))).flat();
}
