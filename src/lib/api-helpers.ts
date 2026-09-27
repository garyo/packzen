/**
 * API Handler Helpers
 *
 * Reusable utilities to reduce duplication across API endpoints
 */

import type { APIContext } from 'astro';
import { env } from 'cloudflare:workers';
import { and, eq } from 'drizzle-orm';
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import type { z } from 'zod';
import { trips, type Trip } from '../../db/schema';
import { planLimit, limitMessage, type LimitKey } from './resource-limits';
import { logChange, getSourceId } from './sync';
import { validateRequestSafe } from './validation';

/**
 * Get a database connection to the Worker's D1 binding
 */
export function getDatabaseConnection(): DrizzleD1Database {
  return drizzle(env.DB);
}

/**
 * Get authenticated user ID from Astro locals
 */
export function getUserId(locals: APIContext['locals']): string {
  return locals.userId as string;
}

/**
 * Standard error response helper
 */
export function errorResponse(message: string, status: number = 500): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Standard success response helper
 */
export function successResponse<T>(data: T, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Thrown for a missing (or not-owned) resource → 404 */
export class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
  }
}

/** Thrown for a malformed or invalid request → 400 */
export class BadRequestError extends Error {}

/** Thrown when a plan limit forbids the request → 403 */
export class ForbiddenError extends Error {}

/**
 * Map a thrown error to a response. Unexpected errors are logged and get a
 * generic 500 so internal details don't leak.
 */
export function errorToResponse(error: unknown, operation: string): Response {
  if (error instanceof NotFoundError) return errorResponse(error.message, 404);
  if (error instanceof BadRequestError) return errorResponse(error.message, 400);
  if (error instanceof ForbiddenError) return errorResponse(error.message, 403);
  console.error(`Error ${operation}:`, error);
  return errorResponse(`Failed to ${operation}`, 500);
}

/** Parse a JSON request body, treating malformed JSON as a bad request. */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new BadRequestError('Request body must be valid JSON');
  }
}

/** Validate `data` against `schema`, throwing a BadRequestError describing any problems. */
export function parseWith<T>(schema: z.ZodType<T>, data: unknown): T {
  const validation = validateRequestSafe(schema, data);
  if (!validation.success) throw new BadRequestError(validation.error);
  return validation.data;
}

/** The trip, if it belongs to the user; otherwise NotFoundError. */
export async function requireOwnedTrip(
  db: DrizzleD1Database,
  userId: string,
  tripId: string
): Promise<Trip> {
  const trip = await db
    .select()
    .from(trips)
    .where(and(eq(trips.id, tripId), eq(trips.clerk_user_id, userId)))
    .get();
  if (!trip) throw new NotFoundError('Trip not found');
  return trip;
}

/** Throw ForbiddenError (403) unless the user's plan allows `total` of `key`. */
export async function enforceLimit(
  locals: APIContext['locals'],
  key: LimitKey,
  total: number
): Promise<void> {
  const max = await planLimit(locals.billing, key, total);
  if (total > max) throw new ForbiddenError(limitMessage(key, max));
}

/**
 * Route params. Every route using these wrappers has only required `[param]`
 * segments, so each param is always present.
 */
type Params = Record<string, string>;

interface HandlerContext {
  db: DrizzleD1Database;
  userId: string;
  params: Params;
  request: Request;
  locals: APIContext['locals'];
}

function handlerContext(context: APIContext): HandlerContext {
  return {
    db: getDatabaseConnection(),
    userId: getUserId(context.locals),
    params: context.params as Params,
    request: context.request,
    locals: context.locals,
  };
}

/**
 * Create a GET handler that returns the handler's result as JSON.
 *
 * @example
 * export const GET: APIRoute = createGetHandler(async ({ db, userId }) => {
 *   return await db.select().from(items).where(eq(items.userId, userId));
 * }, 'fetch items');
 */
export function createGetHandler<T>(
  handler: (context: HandlerContext) => Promise<T>,
  operationName: string
) {
  return async (context: APIContext): Promise<Response> => {
    try {
      return successResponse(await handler(handlerContext(context)));
    } catch (error) {
      return errorToResponse(error, operationName);
    }
  };
}

/** Sync configuration for auto-logging changes from handler factories */
export interface SyncConfig {
  entityType: string;
  /** Extract parent ID from route params */
  parentId?: (params: Params) => string | null;
}

/**
 * Shared implementation for POST/PATCH handlers that validate a JSON body
 * against `schema` and return the handler's result as JSON. A handler may
 * return a Response instead to answer differently (it is then not synced).
 */
function createBodyHandler<TInput, TOutput extends { id: string }>(
  handler: (context: HandlerContext & { validatedData: TInput }) => Promise<TOutput | Response>,
  operationName: string,
  successStatus: number,
  schema: z.ZodType<TInput>,
  sync?: SyncConfig
) {
  return async (context: APIContext): Promise<Response> => {
    try {
      const ctx = handlerContext(context);
      const validatedData = parseWith(schema, await readJsonBody(context.request));
      const result = await handler({ ...ctx, validatedData });
      if (result instanceof Response) return result;

      if (sync) {
        logChange(
          ctx.db,
          ctx.userId,
          {
            entityType: sync.entityType,
            entityId: result.id,
            parentId: sync.parentId?.(ctx.params) ?? null,
            action: successStatus === 201 ? 'create' : 'update',
            data: result,
          },
          getSourceId(context.request)
        );
      }

      return successResponse(result, successStatus);
    } catch (error) {
      return errorToResponse(error, operationName);
    }
  };
}

/**
 * Create a POST handler with validation (convenience wrapper)
 */
export function createPostHandler<TInput, TOutput extends { id: string }>(
  handler: (context: HandlerContext & { validatedData: TInput }) => Promise<TOutput | Response>,
  operationName: string,
  schema: z.ZodType<TInput>,
  sync?: SyncConfig
) {
  return createBodyHandler(handler, operationName, 201, schema, sync);
}

/**
 * Create a PATCH handler with validation (convenience wrapper)
 * Returns 404 if handler returns null or undefined.
 */
export function createPatchHandler<TInput, TOutput extends { id: string }>(
  handler: (context: HandlerContext & { validatedData: TInput }) => Promise<TOutput | undefined>,
  operationName: string,
  schema: z.ZodType<TInput>,
  sync?: SyncConfig
) {
  return createBodyHandler(
    async (ctx) => {
      const result = await handler(ctx);
      if (!result) throw new NotFoundError();
      return result;
    },
    operationName,
    200,
    schema,
    sync
  );
}

/**
 * Create a DELETE handler (convenience wrapper)
 *
 * The handler returns the deleted entity's ID, or false if it wasn't found (→ 404).
 */
export function createDeleteHandler(
  handler: (context: HandlerContext) => Promise<string | false>,
  operationName: string,
  sync: SyncConfig
) {
  return async (context: APIContext): Promise<Response> => {
    try {
      const ctx = handlerContext(context);
      const deletedId = await handler(ctx);
      if (!deletedId) throw new NotFoundError();

      logChange(
        ctx.db,
        ctx.userId,
        {
          entityType: sync.entityType,
          entityId: deletedId,
          parentId: sync.parentId?.(ctx.params) ?? null,
          action: 'delete',
          data: null,
        },
        getSourceId(context.request)
      );

      return successResponse({ success: true });
    } catch (error) {
      return errorToResponse(error, operationName);
    }
  };
}
