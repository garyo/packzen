/**
 * Billing Utilities
 *
 * Back-end helper functions for checking Clerk Billing plans and features
 */

import type { AuthObject } from '@clerk/backend';

export type BillingPlan = 'free_user' | 'standard';

/**
 * Billing status information for a user
 */
export interface BillingStatus {
  hasFreeUserPlan: boolean;
  hasStandardPlan: boolean;
  activePlan: BillingPlan | 'none';
  billingOverride?: string;
}

/**
 * Check user's billing plan status using Clerk's has() method
 * @param auth - Clerk auth object from middleware or API route
 * @returns Billing status with plan information
 */
export function checkBillingStatus(auth: AuthObject, billingOverride?: string): BillingStatus {
  const hasFreeUserPlan = auth.has({ plan: 'free_user' });
  const hasStandardPlan = auth.has({ plan: 'standard' });

  // Determine active plan (standard takes precedence if user has both)
  let activePlan: BillingPlan | 'none' = 'none';
  if (hasStandardPlan || billingOverride === 'standard') {
    activePlan = 'standard';
  } else if (hasFreeUserPlan) {
    activePlan = 'free_user';
  }
  return {
    hasFreeUserPlan,
    hasStandardPlan,
    activePlan,
    billingOverride,
  };
}

/**
 * Log billing status for debugging
 */
export function logBillingStatus(userId: string, status: BillingStatus): void {
  console.log(`[Billing] User ${userId}:`, {
    activePlan: status.activePlan,
    hasFreeUserPlan: status.hasFreeUserPlan,
    hasStandardPlan: status.hasStandardPlan,
    billingOverride: status.billingOverride,
  });
}

/**
 * Check if user has a specific plan
 */
export function hasActivePlan(status: BillingStatus, plan: BillingPlan): boolean {
  return status.activePlan === plan;
}

/**
 * Check if user has standard plan (paid)
 */
export function hasStandardPlan(status: BillingStatus): boolean {
  return status.hasStandardPlan;
}

/**
 * Check if user is on free plan
 */
export function isFreePlan(status: BillingStatus): boolean {
  return status.activePlan === 'free_user';
}
