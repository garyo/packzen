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
  TripItem,
  NewTripItem,
} from '../../db/schema';

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
