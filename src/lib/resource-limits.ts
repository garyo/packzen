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
    maxTrips: 3,
    maxItemsPerTrip: 100,
    maxCategories: 50,
    maxMasterItems: 100,
    maxBagTemplates: 3,
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
    maxTrips: 3,
    maxItemsPerTrip: 50,
    maxCategories: 50,
    maxMasterItems: 50,
    maxBagTemplates: 3,
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
 * Generic resource limit checker.
 * All specific check functions delegate to this.
 */
function checkLimit(
  currentCount: number,
  billingStatus: BillingStatus | null,
  limitKey: keyof PlanLimits,
  message: (max: number) => string
): LimitCheckResult {
  const limits = getLimitsForPlan(billingStatus);
  const maxAllowed = limits[limitKey];
  const allowed = currentCount < maxAllowed;
  return {
    allowed,
    currentCount,
    maxAllowed,
    message: allowed ? undefined : message(maxAllowed),
  };
}

export function checkTripLimit(
  currentCount: number,
  billingStatus: BillingStatus | null
): LimitCheckResult {
  return checkLimit(
    currentCount,
    billingStatus,
    'maxTrips',
    (max) =>
      `You've reached the maximum of ${max} trips. Please delete some trips to create new ones, or upgrade your subscription.`
  );
}

export function checkTripItemLimit(
  currentCount: number,
  billingStatus: BillingStatus | null
): LimitCheckResult {
  return checkLimit(
    currentCount,
    billingStatus,
    'maxItemsPerTrip',
    (max) =>
      `This trip has reached the maximum of ${max} items. Please remove some, or upgrade your subscription.`
  );
}

export function checkCategoryLimit(
  currentCount: number,
  billingStatus: BillingStatus | null
): LimitCheckResult {
  return checkLimit(
    currentCount,
    billingStatus,
    'maxCategories',
    (max) =>
      `You've reached the maximum of ${max} categories. Please remove some, or upgrade your subscription.`
  );
}

export function checkMasterItemLimit(
  currentCount: number,
  billingStatus: BillingStatus | null
): LimitCheckResult {
  return checkLimit(
    currentCount,
    billingStatus,
    'maxMasterItems',
    (max) =>
      `You've reached the maximum of ${max} items in your master list. Please remove some, or upgrade your subscription.`
  );
}

export function checkBagTemplateLimit(
  currentCount: number,
  billingStatus: BillingStatus | null
): LimitCheckResult {
  return checkLimit(
    currentCount,
    billingStatus,
    'maxBagTemplates',
    (max) =>
      `You've reached the maximum of ${max} bag templates. Please remove some, or upgrade your subscription.`
  );
}
