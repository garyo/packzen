import { clerkMiddleware, clerkClient } from '@clerk/astro/server';
import { validateCsrfToken } from './lib/csrf';
import { checkBillingStatus, logBillingStatus } from './lib/billing';

export const onRequest = clerkMiddleware(async (auth, context, next) => {
  // Only apply auth to API routes
  if (!context.url.pathname.startsWith('/api/')) {
    return next();
  }

  // Skip auth/CSRF checks for webhook endpoints (they use signature verification)
  if (context.url.pathname.startsWith('/api/webhooks/')) {
    return next();
  }

  // Get auth state from Clerk
  const authObject = await auth();

  if (!authObject.userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Add user ID to locals for API routes to use
  context.locals.userId = authObject.userId;
  const user = await clerkClient(context).users.getUser(authObject.userId);
  const metadata = user.publicMetadata;

  // Check and log billing status
  const billingStatus = checkBillingStatus(authObject, metadata?.billingOverride as string);
  logBillingStatus(authObject.userId, billingStatus);

  // Store billing status in locals for API routes to use
  context.locals.billingStatus = billingStatus;

  // CSRF protection for state-changing requests
  const method = context.request.method.toUpperCase();
  if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
    if (!validateCsrfToken(context.request)) {
      return new Response(JSON.stringify({ error: 'CSRF token validation failed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  return next();
});
