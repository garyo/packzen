/**
 * Packing counts shared by every view. An item is exactly one of unpacked,
 * packed, or skipped: skipped wins over packed, and skipped items are left
 * out of the total (they aren't coming on the trip).
 */

interface PackState {
  is_packed: boolean;
  is_skipped: boolean;
}

export interface PackingStats {
  /** Items still coming on the trip (excludes skipped). */
  total: number;
  packed: number;
  skipped: number;
  /** total - packed */
  remaining: number;
}

export function packingStats(items: readonly PackState[]): PackingStats {
  let packed = 0;
  let skipped = 0;
  for (const item of items) {
    if (item.is_skipped) skipped++;
    else if (item.is_packed) packed++;
  }
  const total = items.length - skipped;
  return { total, packed, skipped, remaining: total - packed };
}

/** Whole-number percent packed, 0 when there's nothing to pack. */
export function packingProgress(stats: PackingStats): number {
  return stats.total === 0 ? 0 : Math.round((stats.packed / stats.total) * 100);
}

/**
 * Extend a patch so it keeps packed and skipped mutually exclusive, mirroring
 * the server: packing an item un-skips it, and skipping it unpacks it.
 */
export function exclusivePackState<T extends object>(patch: T & Partial<PackState>): T {
  if (patch.is_packed === true) return { ...patch, is_skipped: false };
  if (patch.is_skipped === true) return { ...patch, is_packed: false };
  return patch;
}
