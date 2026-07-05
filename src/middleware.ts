import { clerkMiddleware, clerkClient } from '@clerk/astro/server';
import { validateCsrfToken } from './lib/csrf';
import { checkBillingStatus, logBillingStatus } from './lib/billing';
import { DEV_FAKE_AUTH, parseFakeAuth, devFakeBillingStatus } from './lib/dev-auth';

export const onRequest = clerkMiddleware(async (auth, context, next) => {
  // Only apply auth to API routes
  if (!context.url.pathname.startsWith('/api/')) {
    return next();
  }

  // Skip auth/CSRF checks for webhook endpoints (they use signature verification)
  if (context.url.pathname.startsWith('/api/webhooks/')) {
    return next();
  }

  // Dev-only fake auth: a `Bearer devfake:<id>~<plan>` request stands in for a
  // real Clerk session so local/automated testing can create and switch users
  // without email verification. Gated on DEV_FAKE_AUTH, which is a compile-time
  // `false` in production builds, so this branch is dead-code eliminated there.
  // Only triggers when the client actually sends a fake token; real Clerk
  // requests fall through untouched.
  if (DEV_FAKE_AUTH) {
    const fake = parseFakeAuth(context.request.headers.get('authorization'));
    if (fake) {
      context.locals.userId = fake.userId;
      context.locals.billingStatus = devFakeBillingStatus(fake.plan);
      return next();
    }
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

  // Fast path for SSE sync endpoint — skip billing check to avoid
  // a getUser() call on every ~3s poll
  if (context.url.pathname === '/api/sync/events' && context.request.method === 'GET') {
    return next();
  }

  const user = await clerkClient(context).users.getUser(authObject.userId);
  const metadata = user.publicMetadata;

  // Check and log billing status
  const billingStatus = checkBillingStatus(authObject, metadata?.billingOverride as string);
  logBillingStatus(authObject.userId, billingStatus);

  // Store billing status in locals for API routes to use
  context.locals.billingStatus = billingStatus;

  // CSRF protection for state-changing requests.
  //
  // CSRF only threatens cookie-authenticated requests, where the browser
  // auto-attaches credentials to a cross-site request. A request carrying a
  // Bearer token in the Authorization header is immune: a cross-site attacker
  // cannot set that header (doing so forces a CORS preflight we don't grant)
  // and has no valid token. So we skip the double-submit-cookie check for
  // Bearer-authenticated requests — which is what the app's client always
  // sends, and which also fixes mobile browsers that drop the HttpOnly CSRF
  // cookie. Cookie-only state-changing requests still require a matching token.
  const method = context.request.method.toUpperCase();
  const isStateChanging =
    method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
  const authHeader = context.request.headers.get('authorization') ?? '';
  const hasBearerToken = /^bearer\s+\S/i.test(authHeader);

  if (isStateChanging && !hasBearerToken) {
    if (!validateCsrfToken(context.request)) {
      return new Response(JSON.stringify({ error: 'CSRF token validation failed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  return next();
});
