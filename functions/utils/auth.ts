import type { Env } from './db';

export interface AuthContext {
  userId: string;
  sessionId: string;
}

/**
 * Verify Clerk JWT token and extract user information
 * This is a simplified version - in production, you'd use Clerk's SDK or verify the JWT properly
 */
export async function verifyAuth(request: Request, env: Env): Promise<AuthContext | null> {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);

  try {
    // Verify token with Clerk's API
    const response = await fetch('https://api.clerk.com/v1/sessions/verify', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      console.error('Token verification failed:', response.statusText);
      return null;
    }

    const session = await response.json();

    return {
      userId: session.user_id,
      sessionId: session.id,
    };
  } catch (error) {
    console.error('Auth verification error:', error);
    return null;
  }
}

/**
 * Middleware helper to require authentication
 */
export async function requireAuth(
  request: Request,
  env: Env
): Promise<{ auth: AuthContext } | Response> {
  const auth = await verifyAuth(request, env);

  if (!auth) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return { auth };
}
