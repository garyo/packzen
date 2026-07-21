export const prerender = false;

/**
 * Clerk Webhook Handler
 *
 * Handles webhook events from Clerk (via Svix), including user.deleted
 * to clean up database records when users delete their accounts.
 */

import type { APIRoute } from 'astro';
import { Webhook } from 'svix';
import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import { deleteAllUserData } from '../../../lib/user-data-cleanup';

// Same self-hosted Umami site as the client snippet in BaseLayout.astro.
const UMAMI_ENDPOINT = 'https://analytics.oberbrunner.com/api/send';
const UMAMI_WEBSITE_ID = '02fcf573-fc08-4e95-89d7-3541b6ff7296';

/**
 * Report an account creation to Umami so signups appear in the same
 * dashboard as the marketing-page funnel. Best-effort: analytics must
 * never fail the webhook. Umami's collect endpoint drops requests with
 * bot-like User-Agents, hence the browser-style UA.
 */
async function reportSignupToUmami(): Promise<void> {
  try {
    await fetch(UMAMI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; PackZen-server/1.0)',
      },
      body: JSON.stringify({
        type: 'event',
        payload: {
          website: UMAMI_WEBSITE_ID,
          hostname: 'packzen.org',
          url: '/sign-up',
          name: 'account-created',
        },
      }),
    });
  } catch (error) {
    console.error('Failed to report signup to Umami:', error);
  }
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

export const POST: APIRoute = async (context) => {
  const { request, locals } = context;

  try {
    // Get webhook secret from runtime environment
    const runtime = locals.runtime as
      | { env: { CLERK_WEBHOOK_SECRET?: string; DB: D1Database } }
      | undefined;

    if (!runtime?.env) {
      console.error('Runtime environment not available');
      return new Response('Server configuration error', { status: 500 });
    }

    const WEBHOOK_SECRET = runtime.env.CLERK_WEBHOOK_SECRET;

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
      evt = wh.verify(payload, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as ClerkWebhookEvent;
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
      const db = drizzle(runtime.env.DB);

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
      await reportSignupToUmami();
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
