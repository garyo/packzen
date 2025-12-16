import { getSessionToken } from './clerk';
import type { ApiResponse } from './types';
import { getCsrfHeaderName } from './csrf';

const API_BASE_URL = '/api';

interface RequestOptions extends RequestInit {
  params?: Record<string, string>;
  skipErrorHandling?: boolean; // Allow callers to handle errors themselves
}

// CSRF token cache
let csrfToken: string | null = null;

/**
 * Fetch CSRF token from the server
 * Caches the token for subsequent requests
 */
async function getCsrfToken(): Promise<string> {
  if (csrfToken) {
    return csrfToken;
  }

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

    const data = await response.json();
    csrfToken = data.token;
    return csrfToken as string;
  } catch (error) {
    console.error('Error fetching CSRF token:', error);
    throw error;
  }
}

async function makeRequest<T>(
  endpoint: string,
  options: RequestOptions = {}
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
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      const errorMessage = error.error || `Request failed with status ${response.status}`;

      // Handle 401 errors by redirecting to sign-in
      if (response.status === 401 && !options.skipErrorHandling) {
        // Don't redirect if already on sign-in/sign-up pages
        const currentPath = window.location.pathname;
        if (!currentPath.includes('/sign-in') && !currentPath.includes('/sign-up')) {
          setTimeout(() => {
            window.location.href = '/sign-in';
          }, 1000);
        }
      }

      // Handle 403 CSRF errors by refreshing token and retrying once
      if (response.status === 403 && errorMessage.includes('CSRF') && !options.skipErrorHandling) {
        // Clear cached token and retry once
        csrfToken = null;
        console.warn('CSRF token validation failed, refreshing token and retrying...');
        // Retry the request with a fresh token
        return makeRequest<T>(endpoint, { ...options, skipErrorHandling: true });
      }

      return {
        success: false,
        error: errorMessage,
        statusCode: response.status,
      };
    }

    const data = await response.json();
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
