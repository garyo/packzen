import type { APIContext, MiddlewareNext } from 'astro';
import { clerkMiddleware, type AuthFn } from '@clerk/astro/server';
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

  // Dev-only fake auth (see lib/dev-auth.ts): a `Bearer devfake:<id>`
  // token stands in for a Clerk session. The inline `import.meta.env.DEV` is
  // a build-time `false` in production, so this branch and parseFakeAuth are
  // removed from the production bundle.
  if (import.meta.env.DEV && DEV_FAKE_AUTH) {
    const fakeUserId = parseFakeAuth(authorization);
    if (fakeUserId) {
      context.locals.userId = fakeUserId;
      return next();
    }
  }

  const authObject = await auth();
  if (!authObject.userId) return unauthorized();

  context.locals.userId = authObject.userId;
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
