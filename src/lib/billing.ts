/**
 * Billing plans (Clerk Billing), resolved without a Clerk API call per request.
 */

export type BillingPlan = 'free_user' | 'standard';
export type PlanName = BillingPlan | 'none';

export interface Billing {
  /** The plan in the session token's claims — known without any network call. */
  plan: PlanName;
  /**
   * The plan including an admin-granted `billingOverride` (Clerk user
   * publicMetadata). Fetches it at most once per request, and only when the
   * token's plan isn't already standard.
   */
  effectivePlan(): Promise<PlanName>;
}

/** The plan from Clerk's `has()`, which reads the session token's claims locally. */
export function planFromClaims(auth: { has: (params: { plan: string }) => boolean }): PlanName {
  if (auth.has({ plan: 'standard' })) return 'standard';
  if (auth.has({ plan: 'free_user' })) return 'free_user';
  return 'none';
}

export function createBilling(
  plan: PlanName,
  fetchBillingOverride: () => Promise<unknown> = async () => undefined
): Billing {
  let effective: Promise<PlanName> | undefined;
  return {
    plan,
    effectivePlan() {
      if (plan === 'standard') return Promise.resolve(plan);
      effective ??= fetchBillingOverride().then(
        (override) => (override === 'standard' ? 'standard' : plan),
        (error) => {
          console.error('Failed to fetch billing override; using the session plan:', error);
          return plan;
        }
      );
      return effective;
    },
  };
}
