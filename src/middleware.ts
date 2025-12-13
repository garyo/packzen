import { clerkMiddleware, clerkClient } from '@clerk/astro/server';
import { validateCsrfToken } from './lib/csrf';

export const onRequest = clerkMiddleware(async (auth, context, next) => {
  // Only apply auth to API routes
  if (!context.url.pathname.startsWith('/api/')) {
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
