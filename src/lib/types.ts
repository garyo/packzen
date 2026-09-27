// Re-export database types from schema
export type { Category, MasterItem, Trip, Bag, BagTemplate, TripItem } from '../../db/schema';

import type { Bag, MasterItem, Trip } from '../../db/schema';

// Extended type for master items with joined category name (returned by API)
export type MasterItemWithCategory = MasterItem & {
  category_name: string | null;
};

// Extended type for trips with statistics (returned by API)
export type TripWithStats = Trip & {
  bag_count: number;
  items_total: number;
  items_packed: number;
};

// Auth types
export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  imageUrl?: string;
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

export const BAG_TYPES: Array<{ type: Bag['type']; label: string; description: string }> = [
  { type: 'carry_on', label: 'Carry-on', description: 'Cabin bag for overhead storage' },
  { type: 'checked', label: 'Checked Bag', description: 'Luggage checked at the counter' },
  { type: 'personal', label: 'Personal Item', description: 'Small bag under the seat' },
  { type: 'custom', label: 'Custom', description: 'Your own custom bag type' },
];

// Built-in items types
interface BuiltInCategory {
  name: string;
  icon: string;
  sort_order: number;
}

interface TripType {
  id: string;
  name: string;
  description: string;
  /** Nominal trip length in nights, used to scale per-day consumables. */
  nights: number;
  /** Default name for a trip started from this type. */
  trip_name: string;
  /** Words in a trip's name that suggest this type. */
  keywords: string[];
}

export interface BuiltInItem {
  name: string;
  description: string | null;
  category: string;
  default_quantity: number;
  trip_types: string[]; // Array of trip_type IDs
  is_container?: boolean;
  /** Universal core item: belongs in every trip type's starter list. */
  essential?: boolean;
  /** Situational essential: belongs only in these trip types' starter lists. */
  essential_trip_types?: string[];
  /** Situational essential gated by a starter modifier (international / feminine / masculine). */
  essential_modifiers?: string[];
  /** Consumable whose starter quantity scales with trip length (capped at default_quantity). */
  per_day?: boolean;
}

export interface BuiltInItemsData {
  categories: BuiltInCategory[];
  trip_types: TripType[];
  items: BuiltInItem[];
}

// Selected item for import/add to trip
export interface SelectedBuiltInItem {
  name: string;
  description: string | null;
  category: string;
  quantity: number; // User-adjusted quantity
  is_container?: boolean;
}
