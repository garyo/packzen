// Re-export database types from schema
export type {
  Category,
  NewCategory,
  MasterItem,
  NewMasterItem,
  Trip,
  NewTrip,
  Bag,
  NewBag,
  BagTemplate,
  NewBagTemplate,
  TripItem,
  NewTripItem,
} from '../../db/schema';

// Import for extending
import type { MasterItem, Trip } from '../../db/schema';

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

// Bag types (predefined)
export type BagType = 'carry_on' | 'checked' | 'personal' | 'custom';

export interface BagTypeOption {
  type: BagType;
  label: string;
  description: string;
}

export const BAG_TYPES: BagTypeOption[] = [
  { type: 'carry_on', label: 'Carry-on', description: 'Cabin bag for overhead storage' },
  { type: 'checked', label: 'Checked Bag', description: 'Luggage checked at the counter' },
  { type: 'personal', label: 'Personal Item', description: 'Small bag under the seat' },
  { type: 'custom', label: 'Custom', description: 'Your own custom bag type' },
];

// Built-in items types
export interface BuiltInCategory {
  name: string;
  icon: string;
  sort_order: number;
}

export interface TripType {
  id: string;
  name: string;
  description: string;
}

export interface BuiltInItem {
  name: string;
  description: string | null;
  category: string;
  default_quantity: number;
  trip_types: string[]; // Array of trip_type IDs
  is_container?: boolean;
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
