/**
 * API Handler Helpers
 *
 * Reusable utilities to reduce duplication across API endpoints
 */

import type { APIContext } from 'astro';
import type { D1Database } from '@cloudflare/workers-types';
import { drizzle } from 'drizzle-orm/d1';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { logChange, getSourceId } from './sync';

/**
 * Get database connection from Astro locals
 */
export function getDatabaseConnection(locals: APIContext['locals']): DrizzleD1Database {
  const runtime = locals.runtime as { env: { DB: D1Database } };
  return drizzle(runtime.env.DB);
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

/**
 * Handle API errors consistently
 */
export function handleApiError(error: unknown, operation: string): Response {
  console.error(`Error ${operation}:`, error);

  // Return generic error message (don't leak internal details)
  const message = `Failed to ${operation}`;
  return errorResponse(message, 500);
}

/**
 * Create a standardized API route handler with consistent error handling
 *
 * @example
 * export const GET: APIRoute = createApiHandler(async ({ db, userId }) => {
 *   const items = await db.select().from(items).where(eq(items.userId, userId));
 *   return items;
 * }, 'fetch items');
 */
export function createApiHandler<T>(
  handler: (context: {
    db: DrizzleD1Database;
    userId: string;
    request: Request;
    params: Record<string, string | undefined>;
    locals: APIContext['locals'];
  }) => Promise<T>,
  operationName: string
) {
  return async (context: APIContext): Promise<Response> => {
    try {
      const db = getDatabaseConnection(context.locals);
      const userId = getUserId(context.locals);

      const result = await handler({
        db,
        userId,
        request: context.request,
        params: context.params,
        locals: context.locals,
      });

      return successResponse(result);
    } catch (error) {
      return handleApiError(error, operationName);
    }
  };
}

/**
 * Create a GET handler (convenience wrapper)
 */
export function createGetHandler<T>(
  handler: (context: {
    db: DrizzleD1Database;
    userId: string;
    params: Record<string, string | undefined>;
  }) => Promise<T>,
  operationName: string
) {
  return createApiHandler(async ({ db, userId, params }) => {
    return await handler({ db, userId, params });
  }, operationName);
}

/** Sync configuration for auto-logging changes from handler factories */
export interface SyncConfig {
  entityType: string;
  /** Extract entity ID from the result object (defaults to result.id) */
  entityId?: (result: any) => string;
  /** Extract parent ID from route params */
  parentId?: (params: Record<string, string | undefined>) => string | null;
}

/** Sentinel error for "resource not found" in handler wrappers */
class NotFoundError extends Error {
  constructor() {
    super('Resource not found');
  }
}

/**
 * Shared implementation for POST/PATCH handlers that read a JSON body,
 * optionally validate it, and return a JSON response.
 */
function createBodyHandler<TInput, TOutput>(
  handler: (context: {
    db: DrizzleD1Database;
    userId: string;
    validatedData: TInput;
    params: Record<string, string | undefined>;
  }) => Promise<TOutput>,
  operationName: string,
  successStatus: number,
  validator?: (
    data: unknown
  ) => { success: true; data: TInput } | { success: false; error: string },
  sync?: SyncConfig
) {
  return async (context: APIContext): Promise<Response> => {
    try {
      const db = getDatabaseConnection(context.locals);
      const userId = getUserId(context.locals);
      const body = await context.request.json();

      let validatedData: TInput;
      if (validator) {
        const validation = validator(body);
        if (!validation.success) {
          return errorResponse(validation.error, 400);
        }
        validatedData = validation.data;
      } else {
        validatedData = body as TInput;
      }

      const result = await handler({
        db,
        userId,
        validatedData,
        params: context.params,
      });

      // Log change for sync if configured
      if (sync && result) {
        const action = successStatus === 201 ? 'create' : 'update';
        const entityId = sync.entityId ? sync.entityId(result) : (result as any).id;
        const parentId = sync.parentId ? sync.parentId(context.params) : null;
        const sourceId = getSourceId(context.request);
        logChange(db, userId, sync.entityType, entityId, parentId, action, result, sourceId);
      }

      return successResponse(result, successStatus);
    } catch (error) {
      if (error instanceof NotFoundError) {
        return errorResponse('Resource not found', 404);
      }
      return handleApiError(error, operationName);
    }
  };
}

/**
 * Create a POST handler with validation (convenience wrapper)
 */
export function createPostHandler<TInput, TOutput>(
  handler: (context: {
    db: DrizzleD1Database;
    userId: string;
    validatedData: TInput;
    params: Record<string, string | undefined>;
  }) => Promise<TOutput>,
  operationName: string,
  validator?: (
    data: unknown
  ) => { success: true; data: TInput } | { success: false; error: string },
  sync?: SyncConfig
) {
  return createBodyHandler(handler, operationName, 201, validator, sync);
}

/**
 * Create a PATCH handler with validation (convenience wrapper)
 * Returns 404 if handler returns null.
 */
export function createPatchHandler<TInput, TOutput>(
  handler: (context: {
    db: DrizzleD1Database;
    userId: string;
    validatedData: TInput;
    params: Record<string, string | undefined>;
  }) => Promise<TOutput | null>,
  operationName: string,
  validator?: (
    data: unknown
  ) => { success: true; data: TInput } | { success: false; error: string },
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
    validator,
    sync
  );
}

/**
 * Create a DELETE handler (convenience wrapper)
 *
 * When sync is configured, the handler should return the deleted entity ID
 * (string) instead of boolean, or false/null if not found.
 */
export function createDeleteHandler(
  handler: (context: {
    db: DrizzleD1Database;
    userId: string;
    params: Record<string, string | undefined>;
    request: Request;
  }) => Promise<boolean | string>,
  operationName: string,
  sync?: SyncConfig
) {
  return async (context: APIContext): Promise<Response> => {
    try {
      const db = getDatabaseConnection(context.locals);
      const userId = getUserId(context.locals);

      const result = await handler({
        db,
        userId,
        params: context.params,
        request: context.request,
      });

      if (!result) {
        return errorResponse('Resource not found', 404);
      }

      // Log change for sync if configured
      if (sync) {
        const entityId = typeof result === 'string' ? result : '';
        const parentId = sync.parentId ? sync.parentId(context.params) : null;
        const sourceId = getSourceId(context.request);
        logChange(db, userId, sync.entityType, entityId, parentId, 'delete', null, sourceId);
      }

      return successResponse({ success: true });
    } catch (error) {
      return handleApiError(error, operationName);
    }
  };
}

/**
 * Billing helpers
 */
import type { BillingPlan, BillingStatus } from './billing';
import { hasStandardPlan } from './billing';

/**
 * Get billing status from locals
 */
export function getBillingStatus(locals: APIContext['locals']): BillingStatus | null {
  return locals.billingStatus || null;
}

/**
 * Check if user has required plan (returns error response if not)
 *
 * @example
 * // In an API route:
 * export const GET: APIRoute = async ({ locals }) => {
 *   const billingCheck = requirePlan(locals, 'standard');
 *   if (billingCheck) return billingCheck; // Returns 403 error if plan not met
 *
 *   // User has required plan, continue...
 * };
 */
export function requirePlan(
  locals: APIContext['locals'],
  requiredPlan: BillingPlan
): Response | null {
  const billingStatus = getBillingStatus(locals);

  if (!billingStatus) {
    console.error('Billing status not available in locals');
    return errorResponse('Billing information unavailable', 500);
  }

  // Check if user has the required plan
  if (billingStatus.activePlan !== requiredPlan) {
    console.log(
      `[Billing] User ${locals.userId} attempted to access ${requiredPlan} feature but has ${billingStatus.activePlan} plan`
    );
    return errorResponse(
      `This feature requires the ${requiredPlan} plan. Your current plan is ${billingStatus.activePlan}.`,
      403
    );
  }

  // User has required plan
  return null;
}

/**
 * Check if user has standard (paid) plan
 *
 * @example
 * export const GET: APIRoute = async ({ locals }) => {
 *   const billingCheck = requireStandardPlan(locals);
 *   if (billingCheck) return billingCheck;
 *   // User has standard plan...
 * };
 */
export function requireStandardPlan(locals: APIContext['locals']): Response | null {
  const billingStatus = getBillingStatus(locals);

  if (!billingStatus) {
    return errorResponse('Billing information unavailable', 500);
  }

  if (!hasStandardPlan(billingStatus)) {
    console.log(
      `[Billing] User ${locals.userId} needs standard plan but has ${billingStatus.activePlan}`
    );
    return errorResponse('This feature requires a standard plan subscription.', 403);
  }

  return null;
}
