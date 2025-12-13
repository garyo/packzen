import type { ApiResponse } from './types';
import { showToast } from '../components/ui/Toast';

/**
 * Helper for createResource that handles API errors gracefully
 * Shows toast notifications for errors and returns empty array on failure
 */
export async function fetchWithErrorHandling<T>(
  fetchFn: () => Promise<ApiResponse<T[]>>,
  errorMessage: string = 'Failed to load data'
): Promise<T[]> {
  const response = await fetchFn();

  if (!response.success) {
    // Don't show toast for 401 errors - api.ts will redirect to sign-in
    if (response.statusCode !== 401) {
      showToast('error', response.error || errorMessage);
    }
    return [];
  }

  return response.data || [];
}

/**
 * Helper for createResource that handles API errors for single items
 * Shows toast notifications for errors and returns null on failure
 */
export async function fetchSingleWithErrorHandling<T>(
  fetchFn: () => Promise<ApiResponse<T>>,
  errorMessage: string = 'Failed to load data'
): Promise<T | null> {
  const response = await fetchFn();

  if (!response.success) {
    // Don't show toast for 401 errors - api.ts will redirect to sign-in
    if (response.statusCode !== 401) {
      showToast('error', response.error || errorMessage);
    }
    return null;
  }

  return response.data || null;
}

/**
 * Helper to check if a resource has an error state
 * Can be used with Solid's createResource error state
 */
export function isResourceError<T>(data: T | null | undefined, loading: boolean): boolean {
  return !loading && (data === null || data === undefined);
}
