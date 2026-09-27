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
 * Fetch a list for createResource: a failed load toasts and throws, putting
 * the resource in its error state. Missing data resolves to [].
 */
export async function fetchWithErrorHandling<T>(
  fetchFn: () => Promise<ApiResponse<T[]>>,
  errorMessage: string = 'Failed to load data'
): Promise<T[]> {
  const response = await fetchFn();
  if (!response.success) {
    throw new Error(reportError(response, errorMessage));
  }
  return response.data ?? [];
}

/**
 * Like `fetchWithErrorHandling`, but never throws: a failed load toasts and resolves
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
