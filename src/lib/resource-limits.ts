/**
 * Resource Limits Configuration
 *
 * Enforces per-user limits on resources to prevent abuse.
 * Limits vary by billing plan for future flexibility.
 */

import type { BillingPlan, BillingStatus } from './billing';

/**
 * Resource limit definitions per plan
 */
interface PlanLimits {
  maxTrips: number;
  maxItemsPerTrip: number;
  maxCategories: number;
  maxMasterItems: number;
  maxBagTemplates: number;
}

/**
 * Resource limits by billing plan
 * Standard plan gets higher limits; free users get baseline limits
 */
const PLAN_LIMITS: Record<BillingPlan | 'none', PlanLimits> = {
  // Free users - baseline limits
  free_user: {
    maxTrips: 100,
    maxItemsPerTrip: 500,
    maxCategories: 100,
    maxMasterItems: 500,
    maxBagTemplates: 50,
  },
  // Standard (paid) plan - same for now, can increase later
  standard: {
    maxTrips: 100,
    maxItemsPerTrip: 500,
    maxCategories: 100,
    maxMasterItems: 500,
    maxBagTemplates: 50,
  },
  // Fallback for users without a plan (shouldn't happen, but be safe)
  none: {
    maxTrips: 100,
    maxItemsPerTrip: 500,
    maxCategories: 100,
    maxMasterItems: 500,
    maxBagTemplates: 50,
  },
};

/**
 * Get resource limits for a user based on their billing status
 */
export function getLimitsForPlan(billingStatus: BillingStatus | null): PlanLimits {
  const plan = billingStatus?.activePlan || 'none';
  return PLAN_LIMITS[plan];
}

/**
 * Resource limit check result
 */
export interface LimitCheckResult {
  allowed: boolean;
  currentCount: number;
  maxAllowed: number;
  message?: string;
}

/**
 * Check if user can create another trip
 */
export function checkTripLimit(
  currentCount: number,
  billingStatus: BillingStatus | null
): LimitCheckResult {
  const limits = getLimitsForPlan(billingStatus);
  const allowed = currentCount < limits.maxTrips;
  return {
    allowed,
    currentCount,
    maxAllowed: limits.maxTrips,
    message: allowed
      ? undefined
      : `You've reached the maximum of ${limits.maxTrips} trips. Please delete some trips to create new ones.`,
  };
}

/**
 * Check if user can add another item to a trip
 */
export function checkTripItemLimit(
  currentCount: number,
  billingStatus: BillingStatus | null
): LimitCheckResult {
  const limits = getLimitsForPlan(billingStatus);
  const allowed = currentCount < limits.maxItemsPerTrip;
  return {
    allowed,
    currentCount,
    maxAllowed: limits.maxItemsPerTrip,
    message: allowed
      ? undefined
      : `This trip has reached the maximum of ${limits.maxItemsPerTrip} items.`,
  };
}

/**
 * Check if user can create another category
 */
export function checkCategoryLimit(
  currentCount: number,
  billingStatus: BillingStatus | null
): LimitCheckResult {
  const limits = getLimitsForPlan(billingStatus);
  const allowed = currentCount < limits.maxCategories;
  return {
    allowed,
    currentCount,
    maxAllowed: limits.maxCategories,
    message: allowed
      ? undefined
      : `You've reached the maximum of ${limits.maxCategories} categories.`,
  };
}

/**
 * Check if user can create another master item
 */
export function checkMasterItemLimit(
  currentCount: number,
  billingStatus: BillingStatus | null
): LimitCheckResult {
  const limits = getLimitsForPlan(billingStatus);
  const allowed = currentCount < limits.maxMasterItems;
  return {
    allowed,
    currentCount,
    maxAllowed: limits.maxMasterItems,
    message: allowed
      ? undefined
      : `You've reached the maximum of ${limits.maxMasterItems} items in your master list.`,
  };
}

/**
 * Check if user can create another bag template
 */
export function checkBagTemplateLimit(
  currentCount: number,
  billingStatus: BillingStatus | null
): LimitCheckResult {
  const limits = getLimitsForPlan(billingStatus);
  const allowed = currentCount < limits.maxBagTemplates;
  return {
    allowed,
    currentCount,
    maxAllowed: limits.maxBagTemplates,
    message: allowed
      ? undefined
      : `You've reached the maximum of ${limits.maxBagTemplates} bag templates.`,
  };
}
