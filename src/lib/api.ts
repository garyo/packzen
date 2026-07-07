import { getSessionToken } from './clerk';
import type { ApiResponse } from './types';
import { getCsrfHeaderName } from './csrf';

const API_BASE_URL = '/api';

// Unique ID for this tab — used to filter out own changes in SSE sync
export const sourceId = crypto.randomUUID();

interface RequestOptions extends RequestInit {
  params?: Record<string, string>;
  skipErrorHandling?: boolean; // Allow callers to handle errors themselves
}

// CSRF token cache with request deduplication
let csrfToken: string | null = null;
let csrfTokenPromise: Promise<string> | null = null;

// Guards against scheduling more than one sign-in redirect at a time. Several
// requests can 401 concurrently (or a 401 can race a Clerk session-change
// event); only the first should schedule a navigation.
let redirectScheduled = false;

/**
 * Schedule a one-time redirect to sign-in. Safe to call from multiple
 * concurrent failure paths (e.g. several 401s, or a session-change listener
 * racing a 401) — only the first call schedules a navigation.
 */
export function scheduleSignInRedirect(): void {
  if (redirectScheduled) {
    return;
  }
  const currentPath = window.location.pathname;
  if (currentPath.includes('/sign-in') || currentPath.includes('/sign-up')) {
    return;
  }
  redirectScheduled = true;
  setTimeout(() => {
    window.location.href = `/sign-in?redirect_url=${encodeURIComponent(currentPath)}`;
  }, 1000);
}

/**
 * Fetch CSRF token from the server.
 * Caches the token and deduplicates concurrent requests so parallel
 * API calls share a single fetch.
 */
async function getCsrfToken(): Promise<string> {
  if (csrfToken) {
    return csrfToken;
  }
  if (csrfTokenPromise) {
    return csrfTokenPromise;
  }

  csrfTokenPromise = (async () => {
    try {
      const sessionToken = await getSessionToken();

      const response = await fetch('/api/csrf-token', {
        credentials: 'same-origin',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Failed to fetch CSRF token (${response.status}): ${errorText}`);
      }

      const data: unknown = await response.json();
      if (
        typeof data !== 'object' ||
        data === null ||
        !('token' in data) ||
        typeof (data as Record<string, unknown>).token !== 'string'
      ) {
        throw new Error('Invalid CSRF token response');
      }
      csrfToken = (data as Record<string, string>).token;
      return csrfToken;
    } catch (error) {
      console.error('Error fetching CSRF token:', error);
      throw error;
    } finally {
      csrfTokenPromise = null;
    }
  })();

  return csrfTokenPromise;
}

/**
 * Drop the cached CSRF token (and any in-flight fetch) so the next
 * state-changing request fetches a fresh one. Used to recover from a stale
 * token after the cookie has expired or been cleared.
 */
function clearCsrfToken(): void {
  csrfToken = null;
  csrfTokenPromise = null;
}

// Abort idempotent requests that outlive this window — a stalled Worker/D1
// call otherwise hangs the UI ("Saving..." forever) with no way to recover.
// Observed D1 brownouts stall for ~30s before erroring; timing out at 15s and
// retrying once covers that window. POSTs are exempt: they can't be retried
// (duplicates), so aborting one that would eventually commit just converts a
// slow success into a false failure.
const REQUEST_TIMEOUT_MS = 15_000;

async function makeRequest<T>(
  endpoint: string,
  options: RequestOptions = {},
  csrfRetried = false,
  transientRetried = false
): Promise<ApiResponse<T>> {
  // Non-POST requests are idempotent here (PATCH/PUT/DELETE re-apply cleanly,
  // GET has no effect), so a transient failure — a 5xx or a dropped
  // connection, which can arrive *after* the server already committed the
  // write — is safe to retry once. Retrying a POST could create duplicates.
  const method = options.method?.toUpperCase() ?? 'GET';
  const canRetryTransient = method !== 'POST' && !transientRetried;
  const retryTransient = (cause: string): Promise<ApiResponse<T>> => {
    console.warn(`${method} ${endpoint} failed (${cause}); retrying once...`);
    return makeRequest<T>(endpoint, options, csrfRetried, true);
  };

  let timedOut = false;
  try {
    const token = await getSessionToken();

    // Build URL with query params
    const url = new URL(endpoint, window.location.origin);
    if (options.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    // Get CSRF token for state-changing requests
    const needsCsrf =
      method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
    const csrfTokenValue = needsCsrf ? await getCsrfToken() : null;

    const timeoutController = method === 'POST' ? null : new AbortController();
    const timeoutId = timeoutController
      ? setTimeout(() => {
          timedOut = true;
          timeoutController.abort();
        }, REQUEST_TIMEOUT_MS)
      : null;

    const signals = [options.signal, timeoutController?.signal].filter(
      (s): s is AbortSignal => s != null
    );

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        ...options,
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
          ...(csrfTokenValue && { [getCsrfHeaderName()]: csrfTokenValue }),
          ...(needsCsrf && { 'X-Source-ID': sourceId }),
          ...options.headers,
        },
        signal: signals.length > 1 ? AbortSignal.any(signals) : signals[0],
      });
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorBody: unknown = await response.json().catch(() => null);
      const errorMessage =
        (typeof errorBody === 'object' &&
          errorBody !== null &&
          'error' in errorBody &&
          typeof (errorBody as Record<string, unknown>).error === 'string' &&
          (errorBody as Record<string, string>).error) ||
        `Request failed with status ${response.status}`;

      // Handle 401 errors by redirecting to sign-in. Deduped: N concurrent
      // 401s schedule exactly one redirect (see `scheduleSignInRedirect`).
      if (response.status === 401 && !options.skipErrorHandling) {
        scheduleSignInRedirect();
      }

      // A 403 on a state-changing request likely means a stale CSRF token
      // (expired/cleared cookie). Clear the cached token, fetch a fresh one,
      // and retry exactly once. `csrfRetried` guards against an infinite loop.
      if (response.status === 403 && needsCsrf && !csrfRetried && !options.skipErrorHandling) {
        clearCsrfToken();
        console.warn('Request rejected with 403; refreshing CSRF token and retrying once...');
        return makeRequest<T>(endpoint, options, true, transientRetried);
      }

      // 5xx responses are usually transient (e.g. a D1 stall that errors after
      // the write already committed). The retry both recovers the request and
      // re-records the sync change-log event the failed attempt skipped.
      if (response.status >= 500 && canRetryTransient) {
        return retryTransient(`status ${response.status}`);
      }

      return {
        success: false,
        error: errorMessage,
        statusCode: response.status,
      };
    }

    const data = (await response.json()) as T;
    return {
      success: true,
      data,
    };
  } catch (error) {
    // Retry dropped connections and our own timeout, but not a caller abort.
    if (canRetryTransient && !options.signal?.aborted) {
      return retryTransient(timedOut ? 'timeout' : 'network error');
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

// HTTP method helpers
export const api = {
  get: <T>(endpoint: string, options?: RequestOptions) =>
    makeRequest<T>(endpoint, { ...options, method: 'GET' }),

  post: <T>(endpoint: string, data?: unknown, options?: RequestOptions) =>
    makeRequest<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),

  put: <T>(endpoint: string, data?: unknown, options?: RequestOptions) =>
    makeRequest<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    }),

  patch: <T>(endpoint: string, data?: unknown, options?: RequestOptions) =>
    makeRequest<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    }),

  delete: <T>(endpoint: string, options?: RequestOptions) =>
    makeRequest<T>(endpoint, { ...options, method: 'DELETE' }),
};

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
  tripCopyFromMaster: (tripId: string) => `${API_BASE_URL}/trips/${tripId}/copy-from-master`,

  // User
  deleteAccount: `${API_BASE_URL}/user/delete-account`,

  // Analytics beacon
  analytics: `${API_BASE_URL}/analytics`,
};
