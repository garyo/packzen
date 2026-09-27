/**
 * Built-in items loader and helper utilities
 * Loads curated packing items from YAML data file
 */

import { load } from 'js-yaml';
import builtInDataRaw from '../data/built-in-items.yaml?raw';
import type { BuiltInItemsData, BuiltInItem } from './types';

export type TripType = BuiltInItemsData['trip_types'][number];

export const builtInItems = load(builtInDataRaw) as BuiltInItemsData;

// Categories excluded from generic starter lists: situational for a subset of
// travelers, with no dedicated family trip type. Still browsable in the Built-in browser.
const STARTER_EXCLUDED_CATEGORIES = new Set(['Baby', 'Children']);

/** Additive starter modifiers layered on top of a trip type. */
export type StarterModifier = 'international' | 'feminine' | 'masculine';

/** Nominal nights for a trip type, used to scale per-day consumables. */
function getTripTypeNights(tripTypeId: string): number {
  return builtInItems.trip_types.find((t) => t.id === tripTypeId)?.nights ?? 3;
}

/**
 * Starter quantity for an item on a given trip type. Per-day consumables scale
 * with nominal trip length but never exceed the curated default_quantity, so
 * short trips get trimmed while long trips stay capped (laundry assumption).
 */
export function getStarterQuantity(item: BuiltInItem, tripTypeId: string): number {
  if (!item.per_day) return item.default_quantity;
  return Math.min(item.default_quantity, getTripTypeNights(tripTypeId) + 1);
}

/**
 * Get the curated "starter essentials" for a trip type, optionally layered with
 * modifiers (international travel, clothing style). Resolves to universal core
 * items (essential: true) plus situational essentials whose trip-type gate AND
 * modifier gate are both satisfied, minus excluded categories. Modifiers are
 * purely additive — they never swap or remove neutral core items.
 */
export function getStarterItems(
  tripTypeId: string,
  modifiers: StarterModifier[] = []
): BuiltInItem[] {
  return builtInItems.items.filter((item) => {
    if (STARTER_EXCLUDED_CATEGORIES.has(item.category)) return false;
    if (item.essential === true) return true;
    const hasTripGate = !!item.essential_trip_types?.length;
    const hasModGate = !!item.essential_modifiers?.length;
    if (!hasTripGate && !hasModGate) return false;
    const tripOk = !hasTripGate || item.essential_trip_types!.includes(tripTypeId);
    const modOk =
      !hasModGate ||
      item.essential_modifiers!.some((m) => modifiers.includes(m as StarterModifier));
    return tripOk && modOk;
  });
}

/** International is offered as a starter option, not a trip type of its own. */
export const STARTER_TRIP_TYPES = builtInItems.trip_types.filter((t) => t.id !== 'international');

const mentions = (type: TripType | undefined, word: string) =>
  !!type?.keywords.some((keyword) => word === keyword || word === `${keyword}s`);

/**
 * What a trip's name suggests for its starter list: the trip type whose
 * keyword appears first in the name (whole words; a trailing "s" is fine),
 * and whether it sounds international.
 */
export function suggestStarter(tripName: string): { tripTypeId?: string; international: boolean } {
  const words = tripName.toLowerCase().match(/[a-z]+/g) ?? [];
  const internationalType = builtInItems.trip_types.find((t) => t.id === 'international');
  const tripTypeId = words
    .map((word) => STARTER_TRIP_TYPES.find((type) => mentions(type, word)))
    .find(Boolean)?.id;
  return { tripTypeId, international: words.some((word) => mentions(internationalType, word)) };
}

/** Items suited to any of the given trip types (none given = all items). */
export function getItemsByTripTypes(tripTypeIds: Iterable<string>): BuiltInItem[] {
  const wanted = new Set(tripTypeIds);
  if (wanted.size === 0) return builtInItems.items;
  return builtInItems.items.filter((item) => item.trip_types.some((t) => wanted.has(t)));
}

/**
 * Get category icon by category name
 */
export function getCategoryIcon(categoryName: string): string {
  const category = builtInItems.categories.find((c) => c.name === categoryName);
  return category?.icon || '📦';
}

/**
 * Get all unique categories that contain items matching the given trip types
 * Returns categories sorted by their defined sort_order
 */
export function getCategoriesForTripTypes(tripTypeIds: string[]): string[] {
  const items = tripTypeIds.length === 0 ? builtInItems.items : getItemsByTripTypes(tripTypeIds);
  const categories = new Set(items.map((item) => item.category));
  return Array.from(categories).sort((a, b) => {
    const categoryA = builtInItems.categories.find((c) => c.name === a);
    const categoryB = builtInItems.categories.find((c) => c.name === b);
    return (categoryA?.sort_order || 999) - (categoryB?.sort_order || 999);
  });
}
