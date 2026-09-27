export const prerender = false;

/**
 * Clerk Webhook Handler
 *
 * Handles webhook events from Clerk (via Svix), including user.deleted
 * to clean up database records when users delete their accounts.
 */

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { Webhook } from 'svix';
import { drizzle } from 'drizzle-orm/d1';
import { deleteAllUserData } from '../../../lib/user-data-cleanup';
import { runInBackground } from '../../../lib/background';

// The same featherstat site and collect endpoint as the client tracker in
// BaseLayout.astro, speaking its native protocol (see its tracker.js).
const FEATHERSTAT_COLLECT_URL = 'https://analytics.oberbrunner.com/api/collect';
const FEATHERSTAT_SITE_ID = 6;
const SIGNUP_PING_TIMEOUT_MS = 5000;

/**
 * Report an account creation to featherstat so signups appear in the same
 * dashboard as the marketing-page funnel. Recorded as an event rather than a
 * pageview, and attributed to this server's IP, not the user's. Runs in the
 * background with a timeout: analytics must never delay or fail the webhook
 * (a failed webhook is retried by Svix, which would double-count).
 */
function reportSignup(): void {
  runInBackground(
    fetch(FEATHERSTAT_COLLECT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'PackZen-server/1.0' },
      body: JSON.stringify({
        site: FEATHERSTAT_SITE_ID,
        hits: [
          {
            type: 'event',
            url: 'https://packzen.org/sign-up',
            category: 'signup',
            action: 'account-created',
          },
        ],
      }),
      signal: AbortSignal.timeout(SIGNUP_PING_TIMEOUT_MS),
    }).catch((error) => console.error('Failed to report signup to featherstat:', error))
  );
}

interface ClerkWebhookEvent {
  data: {
    id: string; // User ID
    [key: string]: any;
  };
  object: 'event';
  type: string;
  timestamp: number;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const WEBHOOK_SECRET = env.CLERK_WEBHOOK_SECRET;

    if (!WEBHOOK_SECRET) {
      console.error('Missing CLERK_WEBHOOK_SECRET environment variable');
      return new Response('Server configuration error', { status: 500 });
    }
    // Get the webhook signature headers
    const svixId = request.headers.get('svix-id');
    const svixTimestamp = request.headers.get('svix-timestamp');
    const svixSignature = request.headers.get('svix-signature');

    if (!svixId || !svixTimestamp || !svixSignature) {
      return new Response('Missing svix headers', { status: 400 });
    }

    // Get the raw body
    const payload = await request.text();

    // Verify the webhook signature
    const wh = new Webhook(WEBHOOK_SECRET);
    let evt: ClerkWebhookEvent;

    try {
      wh.verify(payload, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      });
      evt = JSON.parse(payload) as ClerkWebhookEvent;
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return new Response('Invalid signature', { status: 400 });
    }

    // Handle the webhook event
    const { type, data } = evt;
    const userId = data.id;

    console.log(`Received webhook: ${type} for user ${userId}`);

    // Handle user.deleted event
    if (type === 'user.deleted') {
      const db = drizzle(env.DB);

      try {
        await deleteAllUserData(userId, db);
        return new Response(JSON.stringify({ success: true, message: 'User data deleted' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        console.error('Failed to delete user data:', error);
        return new Response(JSON.stringify({ error: 'Failed to delete user data' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    if (type === 'user.created') {
      reportSignup();
      return new Response(JSON.stringify({ success: true, message: 'Signup recorded' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // You can add more event handlers here if needed
    // Example: user.updated, etc.

    return new Response(JSON.stringify({ success: true, message: 'Webhook received' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
