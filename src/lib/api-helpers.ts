/**
 * API Handler Helpers
 *
 * Reusable utilities to reduce duplication across API endpoints
 */

import type { APIContext } from 'astro';
import type { D1Database } from '@cloudflare/workers-types';
import { drizzle } from 'drizzle-orm/d1';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

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
 * Validate required parameter exists
 */
export function validateParam(
  params: Record<string, string | undefined>,
  paramName: string
): string | Response {
  const value = params[paramName];
  if (!value) {
    return errorResponse(`${paramName} is required`, 400);
  }
  return value;
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
  validator?: (data: unknown) => { success: true; data: TInput } | { success: false; error: string }
) {
  return async (context: APIContext): Promise<Response> => {
    try {
      const db = getDatabaseConnection(context.locals);
      const userId = getUserId(context.locals);
      const body = await context.request.json();

      // Validate if validator provided
      if (validator) {
        const validation = validator(body);
        if (!validation.success) {
          return errorResponse(validation.error, 400);
        }

        const result = await handler({
          db,
          userId,
          validatedData: validation.data,
          params: context.params,
        });

        return successResponse(result, 201);
      }

      // No validation, pass body directly
      const result = await handler({
        db,
        userId,
        validatedData: body as TInput,
        params: context.params,
      });

      return successResponse(result, 201);
    } catch (error) {
      return handleApiError(error, operationName);
    }
  };
}

/**
 * Create a PATCH handler with validation (convenience wrapper)
 */
export function createPatchHandler<TInput, TOutput>(
  handler: (context: {
    db: DrizzleD1Database;
    userId: string;
    validatedData: TInput;
    params: Record<string, string | undefined>;
  }) => Promise<TOutput | null>,
  operationName: string,
  validator?: (data: unknown) => { success: true; data: TInput } | { success: false; error: string }
) {
  return async (context: APIContext): Promise<Response> => {
    try {
      const db = getDatabaseConnection(context.locals);
      const userId = getUserId(context.locals);
      const body = await context.request.json();

      // Validate if validator provided
      if (validator) {
        const validation = validator(body);
        if (!validation.success) {
          return errorResponse(validation.error, 400);
        }

        const result = await handler({
          db,
          userId,
          validatedData: validation.data,
          params: context.params,
        });

        if (!result) {
          return errorResponse('Resource not found', 404);
        }

        return successResponse(result);
      }

      // No validation, pass body directly
      const result = await handler({
        db,
        userId,
        validatedData: body as TInput,
        params: context.params,
      });

      if (!result) {
        return errorResponse('Resource not found', 404);
      }

      return successResponse(result);
    } catch (error) {
      return handleApiError(error, operationName);
    }
  };
}

/**
 * Create a DELETE handler (convenience wrapper)
 */
export function createDeleteHandler(
  handler: (context: {
    db: DrizzleD1Database;
    userId: string;
    params: Record<string, string | undefined>;
    request: Request;
  }) => Promise<boolean>,
  operationName: string
) {
  return async (context: APIContext): Promise<Response> => {
    try {
      const db = getDatabaseConnection(context.locals);
      const userId = getUserId(context.locals);

      const success = await handler({
        db,
        userId,
        params: context.params,
        request: context.request,
      });

      if (!success) {
        return errorResponse('Resource not found', 404);
      }

      return successResponse({ success: true });
    } catch (error) {
      return handleApiError(error, operationName);
    }
  };
}
