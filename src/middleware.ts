import type { APIContext, MiddlewareNext } from 'astro';
import { clerkMiddleware, clerkClient, type AuthFn } from '@clerk/astro/server';
import { createBilling, planFromClaims } from './lib/billing';
import { DEV_FAKE_AUTH, parseFakeAuth } from './lib/dev-auth';

// Verified by its Svix signature instead of a Clerk session.
const CLERK_WEBHOOK_PATH = '/api/webhooks/clerk';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Static assets get the same headers from public/_headers.
const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function setSecurityHeaders(headers: Headers): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
}

function withSecurityHeaders(response: Response): Response {
  try {
    setSecurityHeaders(response.headers);
    return response;
  } catch {
    // Some responses (e.g. Response.redirect) have immutable headers; copy those.
    const copy = new Response(response.body, response);
    setSecurityHeaders(copy.headers);
    return copy;
  }
}

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function authenticateApi(
  auth: AuthFn,
  context: APIContext,
  next: MiddlewareNext
): Promise<Response> {
  const authorization = context.request.headers.get('authorization');

  // Writes must carry a Bearer token. Browsers never attach one to a
  // cross-site request (setting it forces a CORS preflight we don't grant),
  // so this is the CSRF defense: cookie-only writes are rejected.
  if (WRITE_METHODS.has(context.request.method) && !/^bearer\s+\S/i.test(authorization ?? '')) {
    return unauthorized();
  }

  // Dev-only fake auth (see lib/dev-auth.ts): a `Bearer devfake:<id>~<plan>`
  // token stands in for a Clerk session. The inline `import.meta.env.DEV` is
  // a build-time `false` in production, so this branch and parseFakeAuth are
  // removed from the production bundle.
  if (import.meta.env.DEV && DEV_FAKE_AUTH) {
    const fake = parseFakeAuth(authorization);
    if (fake) {
      context.locals.userId = fake.userId;
      context.locals.billing = createBilling(fake.plan);
      return next();
    }
  }

  const authObject = await auth();
  if (!authObject.userId) return unauthorized();

  const userId = authObject.userId;
  context.locals.userId = userId;
  // The plan comes from the session token; the billing override needs a
  // Clerk API call, made only if a plan-limit check needs it.
  context.locals.billing = createBilling(planFromClaims(authObject), async () => {
    const user = await clerkClient(context).users.getUser(userId);
    return user.publicMetadata?.billingOverride;
  });

  return next();
}

export const onRequest = clerkMiddleware(async (auth, context, next) => {
  const { pathname } = context.url;
  const response =
    pathname.startsWith('/api/') && pathname !== CLERK_WEBHOOK_PATH
      ? await authenticateApi(auth, context, next)
      : await next();
  return withSecurityHeaders(response);
});
