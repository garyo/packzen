import type { ApiResponse } from './types';
import { showToast } from '../components/ui/Toast';

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
    // Don't show toast for 401 errors - api.ts will redirect to sign-in
    if (response.statusCode !== 401) {
      showToast('error', response.error || errorMessage);
    }
    throw new Error(response.error || errorMessage);
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
