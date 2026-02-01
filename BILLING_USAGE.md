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

### 1. Automatic Logging (Middleware)

Every API request automatically logs the user's billing status:

```
[Billing] User user_xxx: { activePlan: 'standard', hasFreeUserPlan: false, hasStandardPlan: true }
```

This happens in `src/middleware.ts:25-29`.

### 2. Check Billing Status in API Routes

The billing status is available in `locals.billingStatus` for all API routes.

#### Example: Get Billing Status

```typescript
// GET /api/user/billing-status
export const GET: APIRoute = async ({ locals }) => {
  const status = locals.billingStatus;

  return new Response(
    JSON.stringify({
      activePlan: status.activePlan,
      plans: {
        free_user: status.hasFreeUserPlan,
        standard: status.hasStandardPlan,
      },
    }),
    { status: 200 }
  );
};
```

#### Example: Require Standard Plan

```typescript
import { requireStandardPlan } from '../../../lib/api-helpers';

export const GET: APIRoute = async ({ locals }) => {
  // Check if user has standard plan
  const billingCheck = requireStandardPlan(locals);
  if (billingCheck) return billingCheck; // Returns 403 if not standard

  // User has standard plan - continue with premium feature
  // ...
};
```

#### Example: Require Specific Plan

```typescript
import { requirePlan } from '../../../lib/api-helpers';

export const GET: APIRoute = async ({ locals }) => {
  // Require free_user plan
  const billingCheck = requirePlan(locals, 'free_user');
  if (billingCheck) return billingCheck;

  // Or require standard plan
  const standardCheck = requirePlan(locals, 'standard');
  if (standardCheck) return standardCheck;

  // User has required plan
  // ...
};
```

## Available Utilities

### From `src/lib/billing.ts`

- `checkBillingStatus(auth)` - Get billing status from auth object
- `logBillingStatus(userId, status)` - Log billing info to console
- `hasActivePlan(status, plan)` - Check if user has specific plan
- `hasStandardPlan(status)` - Check if user has standard plan
- `isFreePlan(status)` - Check if user is on free plan

### From `src/lib/api-helpers.ts`

- `getBillingStatus(locals)` - Get billing status from locals
- `requirePlan(locals, plan)` - Require specific plan (returns 403 error if not met)
- `requireStandardPlan(locals)` - Require standard plan (returns 403 error if not met)

## Types

```typescript
type BillingPlan = 'free_user' | 'standard';

interface BillingStatus {
  hasFreeUserPlan: boolean;
  hasStandardPlan: boolean;
  activePlan: BillingPlan | 'none';
}
```

## Testing

1. **View billing status:**
   - Make any API request
   - Check Cloudflare logs for `[Billing]` messages

2. **Get billing status endpoint:**

   ```bash
   curl https://packzen.org/api/user/billing-status
   ```

3. **Test plan requirements:**
   - Add `requireStandardPlan(locals)` to an API route
   - Try accessing as free user → should get 403
   - Try accessing as standard user → should work

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
