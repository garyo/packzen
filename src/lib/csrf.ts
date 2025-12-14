/**
 * CSRF (Cross-Site Request Forgery) Protection Utilities
 *
 * Implements double-submit cookie pattern:
 * 1. Generate a random token
 * 2. Set it as a cookie
 * 3. Require clients to send it back in a header
 * 4. Validate that cookie value matches header value
 */

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const TOKEN_LENGTH = 32;

/**
 * Generate a cryptographically secure random CSRF token
 */
export function generateCsrfToken(): string {
  const array = new Uint8Array(TOKEN_LENGTH);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Validate CSRF token from request
 * Compares the token from cookie with the token from header
 */
export function validateCsrfToken(request: Request): boolean {
  // Get token from cookie
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) {
    return false;
  }

  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [key, ...value] = c.trim().split('=');
      return [key, value.join('=')];
    })
  );

  const cookieToken = cookies[CSRF_COOKIE_NAME];
  if (!cookieToken) {
    return false;
  }

  // Get token from header
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  if (!headerToken) {
    return false;
  }

  // Constant-time comparison to prevent timing attacks
  return constantTimeCompare(cookieToken, headerToken);
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Create Set-Cookie header value for CSRF token
 */
export function createCsrfCookie(token: string, maxAge: number = 86400): string {
  // Set cookie for 24 hours by default
  // Use SameSite=Strict for maximum protection
  // Secure flag will be set in production (HTTPS)
  return `${CSRF_COOKIE_NAME}=${token}; Path=/; Max-Age=${maxAge}; SameSite=Strict; HttpOnly`;
}

/**
 * Get CSRF cookie name for client-side access
 */
export function getCsrfCookieName(): string {
  return CSRF_COOKIE_NAME;
}

/**
 * Get CSRF header name for client-side access
 */
export function getCsrfHeaderName(): string {
  return CSRF_HEADER_NAME;
}
