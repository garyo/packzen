import { getSessionToken } from './clerk';
import type { ApiResponse } from './types';

const API_BASE_URL = '/api';

// Unique ID for this tab — used to filter out own changes in SSE sync
export const sourceId = crypto.randomUUID();

// Guards against scheduling more than one sign-in redirect at a time. Several
// requests can 401 concurrently (or a 401 can race a Clerk session-change
// event); only the first should schedule a navigation.
let redirectScheduled = false;

/**
 * Schedule a one-time redirect to sign-in that returns to the current page
 * (path and query). Safe to call from multiple concurrent failure paths.
 */
export function scheduleSignInRedirect(): void {
  if (redirectScheduled) {
    return;
  }
  const { pathname, search } = window.location;
  if (pathname.includes('/sign-in') || pathname.includes('/sign-up')) {
    return;
  }
  redirectScheduled = true;
  setTimeout(() => {
    window.location.href = `/sign-in?redirect_url=${encodeURIComponent(pathname + search)}`;
  }, 1000);
}

// Abort idempotent requests that outlive this window — a stalled Worker/D1
// call otherwise hangs the UI ("Saving..." forever) with no way to recover.
// Observed D1 brownouts stall for ~30s before erroring; timing out at 15s and
// retrying once covers that window. POSTs are exempt: they can't be retried
// (duplicates), so aborting one that would eventually commit just converts a
// slow success into a false failure.
const REQUEST_TIMEOUT_MS = 15_000;

/** External calls the client needs, injectable so tests can drive every path. */
export interface ApiDeps {
  fetch: (input: string, init: RequestInit) => Promise<Response>;
  getToken: () => Promise<string | null>;
  timeoutMs: number;
}

function errorMessageFrom(body: unknown, status: number): string {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const { error } = body as { error: unknown };
    if (typeof error === 'string' && error) return error;
  }
  return `Request failed with status ${status}`;
}

/** Build an API client. Every method resolves to an `ApiResponse`; none throws. */
export function createApi(deps: Partial<ApiDeps> = {}) {
  const {
    fetch: doFetch = (input, init) => fetch(input, init),
    getToken = getSessionToken,
    timeoutMs = REQUEST_TIMEOUT_MS,
  } = deps;

  async function request<T>(
    method: string,
    endpoint: string,
    body: unknown,
    options: RequestInit = {},
    retried = false
  ): Promise<ApiResponse<T>> {
    // Non-POST requests are idempotent here (PATCH/PUT/DELETE re-apply cleanly,
    // GET has no effect), so a transient failure — a 5xx or a dropped
    // connection, which can arrive *after* the server already committed the
    // write — is safe to retry once. Retrying a POST could create duplicates.
    const canRetry = method !== 'POST' && !retried;
    const retry = (cause: string): Promise<ApiResponse<T>> => {
      console.warn(`${method} ${endpoint} failed (${cause}); retrying once...`);
      return request<T>(method, endpoint, body, options, true);
    };

    let timedOut = false;
    try {
      const token = await getToken();
      if (!token) {
        scheduleSignInRedirect();
        return { success: false, statusCode: 401, error: 'Not signed in' };
      }

      const timeout = method === 'POST' ? null : new AbortController();
      const timeoutId =
        timeout &&
        setTimeout(() => {
          timedOut = true;
          timeout.abort();
        }, timeoutMs);
      const signals = [options.signal, timeout?.signal].filter((s): s is AbortSignal => s != null);

      let response: Response;
      try {
        response = await doFetch(endpoint, {
          ...options,
          method,
          body: body === undefined ? options.body : JSON.stringify(body),
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...(method !== 'GET' && { 'X-Source-ID': sourceId }),
            ...options.headers,
          },
          signal: signals.length > 1 ? AbortSignal.any(signals) : signals[0],
        });
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }

      if (response.ok) {
        return { success: true, data: (await response.json()) as T };
      }

      // The thing is gone either way: an earlier attempt committed before a
      // 5xx, or a container delete already cascaded to it.
      if (method === 'DELETE' && response.status === 404) {
        return { success: true };
      }

      if (response.status === 401) {
        scheduleSignInRedirect();
      }

      // 5xx responses are usually transient (e.g. a D1 stall that errors after
      // the write already committed). The retry both recovers the request and
      // re-records the sync change-log event the failed attempt skipped.
      if (response.status >= 500 && canRetry) {
        return retry(`status ${response.status}`);
      }

      const errorBody: unknown = await response.json().catch(() => null);
      return {
        success: false,
        error: errorMessageFrom(errorBody, response.status),
        statusCode: response.status,
      };
    } catch (error) {
      // Retry dropped connections and our own timeout, but not a caller abort.
      if (canRetry && !options.signal?.aborted) {
        return retry(timedOut ? 'timeout' : 'network error');
      }
      console.error('API request error:', error);
      return {
        success: false,
        error: timedOut
          ? 'Request timed out'
          : error instanceof Error
            ? error.message
            : 'An unknown error occurred',
      };
    }
  }

  return {
    get: <T>(endpoint: string, options?: RequestInit) =>
      request<T>('GET', endpoint, undefined, options),
    post: <T>(endpoint: string, data?: unknown, options?: RequestInit) =>
      request<T>('POST', endpoint, data, options),
    patch: <T>(endpoint: string, data?: unknown, options?: RequestInit) =>
      request<T>('PATCH', endpoint, data, options),
    delete: <T>(endpoint: string, options?: RequestInit) =>
      request<T>('DELETE', endpoint, undefined, options),
  };
}

export type ApiClient = ReturnType<typeof createApi>;

export const api = createApi();

// API endpoints
export const endpoints = {
  // Categories
  categories: `${API_BASE_URL}/categories`,
  category: (id: string) => `${API_BASE_URL}/categories/${id}`,

  // Master Items
  masterItems: `${API_BASE_URL}/master-items`,
  masterItem: (id: string) => `${API_BASE_URL}/master-items/${id}`,

  // Bag Templates
  bagTemplates: `${API_BASE_URL}/bag-templates`,
  bagTemplate: (id: string) => `${API_BASE_URL}/bag-templates/${id}`,

  // Trips
  trips: `${API_BASE_URL}/trips`,
  trip: (id: string) => `${API_BASE_URL}/trips/${id}`,
  tripBags: (tripId: string) => `${API_BASE_URL}/trips/${tripId}/bags`,
  tripItems: (tripId: string) => `${API_BASE_URL}/trips/${tripId}/items`,

  // Analytics beacon
  analytics: `${API_BASE_URL}/analytics`,
};
