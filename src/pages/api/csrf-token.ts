export const prerender = false;

import type { APIRoute } from 'astro';
import { generateCsrfToken, createCsrfCookie, getCsrfCookieName } from '../../lib/csrf';

/**
 * GET /api/csrf-token
 *
 * Generates and returns a CSRF token.
 * Sets the token as an HttpOnly cookie and also returns it in the response
 * so the client can include it in request headers.
 */
export const GET: APIRoute = async ({ request }) => {
  // Check if a valid CSRF token already exists in cookies
  const cookieHeader = request.headers.get('cookie');
  let existingToken: string | null = null;

  if (cookieHeader) {
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map((c) => {
        const [key, ...value] = c.trim().split('=');
        return [key, value.join('=')];
      })
    );
    existingToken = cookies[getCsrfCookieName()] || null;
  }

  // Generate new token or use existing one
  const token = existingToken || generateCsrfToken();

  return new Response(JSON.stringify({ token }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': createCsrfCookie(token),
    },
  });
};
