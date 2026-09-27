export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import {
  getDatabaseConnection,
  getUserId,
  successResponse,
  errorToResponse,
  parseWith,
  BadRequestError,
} from '../../lib/api-helpers';
import { logEvent } from '../../lib/analytics';

const MAX_BODY_BYTES = 1024;

// The only event the browser reports; everything else is logged server-side,
// so clients can't forge funnel events or store arbitrary props.
const clientEventSchema = z
  .object({
    event: z.literal('list_printed'),
    props: z.object({ tripId: z.string().uuid() }).strict(),
  })
  .strict();

async function readSmallJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  const text = declaredLength > MAX_BODY_BYTES ? null : await request.text();
  if (text === null || text.length > MAX_BODY_BYTES) {
    throw new BadRequestError('Request body too large');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new BadRequestError('Request body must be valid JSON');
  }
}

/**
 * Beacon endpoint for analytics events only the browser can observe (the
 * print view loading).
 */
export const POST: APIRoute = async (context) => {
  try {
    const { event, props } = parseWith(clientEventSchema, await readSmallJson(context.request));
    const db = getDatabaseConnection(context.locals);
    logEvent(db, event, { userId: getUserId(context.locals), props });
    return successResponse({ ok: true }, 202);
  } catch (error) {
    return errorToResponse(error, 'log analytics event');
  }
};
