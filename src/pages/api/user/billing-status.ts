export const prerender = false;

import type { APIRoute } from 'astro';

/**
 * GET /api/user/billing-status
 * Returns the current user's billing plan status
 */
export const GET: APIRoute = async ({ locals }) => {
  const billingStatus = locals.billingStatus;

  if (!billingStatus) {
    return new Response(JSON.stringify({ error: 'Billing status not available' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log(`[API] Billing status requested for user ${locals.userId}:`, billingStatus);

  return new Response(
    JSON.stringify({
      activePlan: billingStatus.activePlan,
      plans: {
        free_user: billingStatus.hasFreeUserPlan,
        standard: billingStatus.hasStandardPlan,
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};
