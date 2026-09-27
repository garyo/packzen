import type { ApiResponse } from './types';
import { showToast } from '../components/ui/Toast';

function reportError(response: ApiResponse<unknown>, errorMessage: string): string {
  const message = response.error || errorMessage;
  // Don't show toast for 401 errors - api.ts will redirect to sign-in
  if (response.statusCode !== 401) {
    showToast('error', message);
  }
  return message;
}

/**
 * Helper for createResource that handles API errors gracefully.
 * Shows toast notifications for errors and throws to set resource error state.
 */
async function fetchResource<T>(
  fetchFn: () => Promise<ApiResponse<T>>,
  fallback: T,
  errorMessage: string
): Promise<T> {
  const response = await fetchFn();
  if (!response.success) {
    throw new Error(reportError(response, errorMessage));
  }
  return response.data ?? fallback;
}

/**
 * Fetch a list resource with error handling (returns [] on missing data)
 */
export async function fetchWithErrorHandling<T>(
  fetchFn: () => Promise<ApiResponse<T[]>>,
  errorMessage: string = 'Failed to load data'
): Promise<T[]> {
  return fetchResource(fetchFn, [], errorMessage);
}

/**
 * Fetch a single resource with error handling (returns null on missing data)
 */
export async function fetchSingleWithErrorHandling<T>(
  fetchFn: () => Promise<ApiResponse<T>>,
  errorMessage: string = 'Failed to load data'
): Promise<T | null> {
  return fetchResource(fetchFn, null as T | null, errorMessage);
}

/**
 * Like the helpers above, but never throws: a failed load toasts and resolves
 * to `fallback`. Use it for resources a page can still render without, where
 * an errored resource would otherwise throw on read and blank the page.
 */
export async function fetchWithFallback<T>(
  fetchFn: () => Promise<ApiResponse<T>>,
  fallback: T,
  errorMessage: string = 'Failed to load data'
): Promise<T> {
  const response = await fetchFn();
  if (!response.success) {
    reportError(response, errorMessage);
    return fallback;
  }
  return response.data ?? fallback;
}
