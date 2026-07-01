export const prerender = false;

import type { APIRoute } from 'astro';
import {
  getDatabaseConnection,
  getUserId,
  errorResponse,
  successResponse,
  handleApiError,
} from '../../lib/api-helpers';
import { logEvent } from '../../lib/analytics';

/**
 * Beacon endpoint for client-side analytics events (e.g. views that are only
 * rendered in the browser). Append-only and best-effort — a failure here must
 * never surface to the user, so we still return 200 even if logging is skipped.
 */
export const POST: APIRoute = async (context) => {
  try {
    const db = getDatabaseConnection(context.locals);
    const userId = getUserId(context.locals);

    const body = (await context.request.json().catch(() => null)) as {
      event?: unknown;
      props?: unknown;
    } | null;

    const event = body && typeof body.event === 'string' ? body.event : null;
    if (!event) {
      return errorResponse('event is required', 400);
    }

    const props =
      body && typeof body.props === 'object' && body.props !== null
        ? (body.props as Record<string, unknown>)
        : undefined;

    void logEvent(db, event, { userId, props });
    return successResponse({ ok: true }, 202);
  } catch (error) {
    return handleApiError(error, 'log analytics event');
  }
};
