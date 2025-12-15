/**
 * Built-in items loader and helper utilities
 * Loads curated packing items from YAML data file
 */

import yaml from 'js-yaml';
import builtInDataRaw from '../data/built-in-items.yaml?raw';
import type { BuiltInItemsData, BuiltInItem } from './types';

// Load and parse the YAML data
export const builtInItems: BuiltInItemsData = yaml.load(builtInDataRaw) as BuiltInItemsData;

/**
 * Get items by category name
 */
export function getItemsByCategory(categoryName: string): BuiltInItem[] {
  return builtInItems.items.filter((item) => item.category === categoryName);
}

/**
 * Get items by single trip type
 */
export function getItemsByTripType(tripTypeId: string): BuiltInItem[] {
  return builtInItems.items.filter((item) => item.trip_types.includes(tripTypeId));
}

/**
 * Get items by multiple trip types (intersection)
 * Returns items that have ALL the specified trip types
 */
export function getItemsByTripTypes(tripTypeIds: string[]): BuiltInItem[] {
  if (tripTypeIds.length === 0) return builtInItems.items;
  return builtInItems.items.filter((item) =>
    tripTypeIds.every((typeId) => item.trip_types.includes(typeId))
  );
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
