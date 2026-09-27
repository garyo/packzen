import { isSignedIn } from '../../lib/clerk';

const AUTH_TIMEOUT_MS = 15_000;

const SPINNER_HTML = `
  <div class="flex justify-center py-24" role="status" aria-label="Loading">
    <div class="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
  </div>`;

const TIMEOUT_HTML = `
  <div class="mx-auto max-w-sm px-4 py-24 text-center">
    <p class="mb-4 text-gray-700">Signing in is taking longer than expected. Check your connection and try again.</p>
    <button type="button" class="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700">Retry</button>
  </div>`;

/**
 * Client-side auth gate for a page's app root: shows a spinner while Clerk
 * loads, then either redirects to sign-in or calls `mount`. If Clerk hasn't
 * answered in time (e.g. a stalled network), offers Retry instead of leaving
 * the page blank forever.
 */
export async function mountWhenSignedIn(root: HTMLElement, mount: () => void): Promise<void> {
  root.innerHTML = SPINNER_HTML;

  const signedIn = await Promise.race([
    isSignedIn(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), AUTH_TIMEOUT_MS)),
  ]);

  if (signedIn === null) {
    root.innerHTML = TIMEOUT_HTML;
    root.querySelector('button')?.addEventListener('click', () => window.location.reload());
    return;
  }
  if (!signedIn) {
    const path = window.location.pathname + window.location.search;
    window.location.replace(`/sign-in?redirect_url=${encodeURIComponent(path)}`);
    return;
  }
  root.replaceChildren();
  mount();
}
