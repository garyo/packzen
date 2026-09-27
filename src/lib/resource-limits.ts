/**
 * Resource Limits Configuration
 *
 * Per-user limits on resources, by billing plan.
 */

import type { Billing, PlanName } from './billing';

interface PlanLimits {
  maxTrips: number;
  maxItemsPerTrip: number;
  maxCategories: number;
  maxMasterItems: number;
  maxBagTemplates: number;
}

export type LimitKey = keyof PlanLimits;

const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  free_user: {
    maxTrips: 3,
    maxItemsPerTrip: 100,
    maxCategories: 50,
    maxMasterItems: 100,
    maxBagTemplates: 3,
  },
  // Standard (paid) plan
  standard: {
    maxTrips: 100,
    maxItemsPerTrip: 500,
    maxCategories: 100,
    maxMasterItems: 500,
    maxBagTemplates: 50,
  },
  // Fallback for users without a plan (shouldn't happen, but be safe)
  none: {
    maxTrips: 3,
    maxItemsPerTrip: 50,
    maxCategories: 50,
    maxMasterItems: 50,
    maxBagTemplates: 3,
  },
};

const LIMIT_MESSAGES: Record<LimitKey, (max: number) => string> = {
  maxTrips: (max) =>
    `You've reached the maximum of ${max} trips. Please delete some trips to create new ones, or upgrade your subscription.`,
  maxItemsPerTrip: (max) =>
    `This trip has reached the maximum of ${max} items. Please remove some, or upgrade your subscription.`,
  maxCategories: (max) =>
    `You've reached the maximum of ${max} categories. Please remove some, or upgrade your subscription.`,
  maxMasterItems: (max) =>
    `You've reached the maximum of ${max} items in My Items. Please remove some, or upgrade your subscription.`,
  maxBagTemplates: (max) =>
    `You've reached the maximum of ${max} bags in My Bags. Please remove some, or upgrade your subscription.`,
};

export function getLimitsForPlan(plan: PlanName): PlanLimits {
  return PLAN_LIMITS[plan];
}

export function limitMessage(key: LimitKey, max: number): string {
  return LIMIT_MESSAGES[key](max);
}

/**
 * The user's limit for `key`. The session token's plan settles most checks;
 * the billing override (a Clerk API call) is consulted only when that plan's
 * limit is below `needed`.
 */
export async function planLimit(
  billing: Billing | undefined,
  key: LimitKey,
  needed: number
): Promise<number> {
  const limit = PLAN_LIMITS[billing?.plan ?? 'none'][key];
  if (!billing || needed <= limit) return limit;
  return PLAN_LIMITS[await billing.effectivePlan()][key];
}
