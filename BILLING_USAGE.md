# Billing Integration Usage Guide

This document explains how to use the Clerk Billing integration in the app.

## Current Setup

**Plans configured in Clerk:**

- `free_user` - Free tier
- `standard` - Paid tier

**Metadata configured in Clerk:**
To give a user a free subscription:

Store a plan name (currently only "standard") in billingOverride in user's public metadata:

```
{billingOverride: 'standard'}
```

The billing code uses this to override the user's actual plan (may be none or free) with the given plan.

## How It Works

Plan checks never cost a Clerk API call on the common path:

1. **Middleware** (`src/middleware.ts`) reads the plan from the session token's
   claims with Clerk's `has({ plan })` — a local check — and stores a `Billing`
   object in `locals.billing`.
2. **Plan limits** (`src/lib/resource-limits.ts`) are enforced by the create
   endpoints via `enforceLimit(locals, key, total)` in `src/lib/api-helpers.ts`,
   which answers 403 when the plan doesn't allow `total`.
3. **The billing override** is only fetched (one `users.getUser` call, memoized
   per request) when a limit check would fail under the token's plan and that
   plan isn't already `standard`. If Clerk is unreachable, the token's plan
   applies.

To gate a feature on the plan in an API route:

```typescript
const plan = await locals.billing?.effectivePlan(); // includes billingOverride
if (plan !== 'standard') {
  return errorResponse('This feature requires the standard plan.', 403);
}
```

## Types

```typescript
type BillingPlan = 'free_user' | 'standard';
type PlanName = BillingPlan | 'none';

interface Billing {
  plan: PlanName; // from the session token
  effectivePlan(): Promise<PlanName>; // including billingOverride
}
```

## Testing

Plan limits are covered by `tests/d1-api.test.ts`. Locally, dev fake auth
(`/dev/login`) lets you sign in as a free or standard user without Clerk.

## Frontend Setup

### Redirect Configuration

The app uses environment variables to configure fallback redirect URLs after authentication. These are configured in `wrangler.jsonc`:

```jsonc
{
  "vars": {
    "CLERK_SIGN_IN_FALLBACK_REDIRECT_URL": "/dashboard",
    "CLERK_SIGN_UP_FALLBACK_REDIRECT_URL": "/dashboard",
  },
}
```

**How it works:**

1. **Protected pages with redirect_url**: When an unauthenticated user accesses a protected page (e.g., `/dashboard`), the API returns 401. The client-side error handler in `src/lib/api.ts:90` redirects to `/sign-in?redirect_url=/dashboard`. After authentication, Clerk uses this `redirect_url` to return the user to the original page.

2. **Direct sign-in visits**: When a user directly visits `/sign-in` (no `redirect_url` parameter), the fallback environment variable is used, sending them to `/dashboard` after authentication.

**Checkout Redirect:** The pricing page uses the `newSubscriptionRedirectUrl` prop in the `mountPricingTable()` call to redirect users to `/dashboard` after successful subscription.

### Pricing Page

A pricing page has been created at `/pricing` that uses Clerk's `<PricingTable />` component.

**Enable Free Trials:**

1. Go to Clerk Dashboard → Billing → Subscription Plans
2. Select a plan
3. Enable "Free Trial"
4. Set trial duration (e.g., 14 days)
5. The PricingTable component automatically updates

### User Access

Users can access pricing/subscription through:

- **User Menu** → "Subscription & Pricing"
- **UserProfile component** (shows current subscription)
- Direct link: `/pricing`

### Subscription Management

Users can manage their subscriptions through the `<UserProfile />` component:

- View current plan
- Cancel subscription
- Update payment method

## Next Steps: Adding Features

When you add features in Clerk Dashboard:

1. Go to Clerk Dashboard → Billing → Features
2. Add feature (e.g., "advanced_analytics")
3. Assign to plans
4. Use in code:
   ```typescript
   const auth = await getAuth(locals);
   if (!auth.has({ feature: 'advanced_analytics' })) {
     return new Response('Feature not available', { status: 403 });
   }
   ```

Or add to the billing helpers in `src/lib/billing.ts`.
