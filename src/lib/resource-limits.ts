/**
 * Per-user resource limits. PackZen is free, so these are ceilings no real
 * packing list reaches; they only stop a runaway client or abuse from filling
 * the database.
 */

export const LIMITS = {
  maxTrips: 1000,
  maxItemsPerTrip: 1000,
  maxCategories: 500,
  maxMasterItems: 5000,
  maxBagTemplates: 500,
} as const;

export type LimitKey = keyof typeof LIMITS;

const LIMIT_MESSAGES: Record<LimitKey, (max: number) => string> = {
  maxTrips: (max) =>
    `You've reached the maximum of ${max} trips. Please delete some trips to create new ones.`,
  maxItemsPerTrip: (max) => `This trip has reached the maximum of ${max} items.`,
  maxCategories: (max) => `You've reached the maximum of ${max} categories.`,
  maxMasterItems: (max) => `You've reached the maximum of ${max} items in My Items.`,
  maxBagTemplates: (max) => `You've reached the maximum of ${max} bags in My Bags.`,
};

export function limitMessage(key: LimitKey): string {
  return LIMIT_MESSAGES[key](LIMITS[key]);
}
