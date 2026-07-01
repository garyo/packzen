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

async function makeRequest<T>(
  endpoint: string,
  options: RequestOptions = {},
  csrfRetried = false
): Promise<ApiResponse<T>> {
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
    const method = options.method?.toUpperCase();
    const needsCsrf =
      method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
    const csrfTokenValue = needsCsrf ? await getCsrfToken() : null;

    const response = await fetch(url.toString(), {
      ...options,
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(csrfTokenValue && { [getCsrfHeaderName()]: csrfTokenValue }),
        ...(needsCsrf && { 'X-Source-ID': sourceId }),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorBody: unknown = await response.json().catch(() => null);
      const errorMessage =
        (typeof errorBody === 'object' &&
          errorBody !== null &&
          'error' in errorBody &&
          typeof (errorBody as Record<string, unknown>).error === 'string' &&
          (errorBody as Record<string, string>).error) ||
        `Request failed with status ${response.status}`;

      // Handle 401 errors by redirecting to sign-in
      if (response.status === 401 && !options.skipErrorHandling) {
        // Don't redirect if already on sign-in/sign-up pages
        const currentPath = window.location.pathname;
        if (!currentPath.includes('/sign-in') && !currentPath.includes('/sign-up')) {
          setTimeout(() => {
            window.location.href = `/sign-in?redirect_url=${encodeURIComponent(currentPath)}`;
          }, 1000);
        }
      }

      // A 403 on a state-changing request likely means a stale CSRF token
      // (expired/cleared cookie). Clear the cached token, fetch a fresh one,
      // and retry exactly once. `csrfRetried` guards against an infinite loop.
      if (response.status === 403 && needsCsrf && !csrfRetried && !options.skipErrorHandling) {
        clearCsrfToken();
        console.warn('Request rejected with 403; refreshing CSRF token and retrying once...');
        return makeRequest<T>(endpoint, options, true);
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
    console.error('API request error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred',
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
};
