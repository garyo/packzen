/**
 * Search utilities with tiered relevance ranking
 */

/**
 * Search items with tiered relevance ranking
 * Returns items sorted by relevance: exact match > starts with > contains
 */
export function searchItems<T extends { name: string }>(query: string, items: T[]): T[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const exact: T[] = [];
  const startsWith: T[] = [];
  const contains: T[] = [];

  items.forEach((item) => {
    const name = item.name.toLowerCase();
    if (name === q) {
      exact.push(item);
    } else if (name.startsWith(q)) {
      startsWith.push(item);
    } else if (name.includes(q)) {
      contains.push(item);
    }
  });

  return [...exact, ...startsWith, ...contains];
}
