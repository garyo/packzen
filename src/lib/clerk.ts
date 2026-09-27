import { $clerkStore, $isLoadedStore } from '@clerk/astro/client';
import { DEV_FAKE_AUTH, getFakeUser, fakeUserToken, clearFakeUser } from './dev-auth';

/**
 * Single Clerk client managed by the `@clerk/astro` integration.
 *
 * The integration injects its bootstrap script on every page (via Astro's
 * `injectScript`), so `window.Clerk` and these nanostores are always present.
 * We read the instance from `$clerkStore` and its loaded state from
 * `$isLoadedStore` instead of constructing our own `clerk-js` instance.
 */
type ClerkClient = NonNullable<ReturnType<typeof $clerkStore.get>>;

// How long to wait for clerk-js before giving up (offline, blocked by an ad
// blocker, CDN outage), so gated pages can offer a retry instead of hanging.
const CLERK_LOAD_TIMEOUT_MS = 10_000;

/**
 * Resolve once the @clerk/astro client exists and has finished loading.
 * Returns immediately if Clerk is already loaded; rejects if it hasn't loaded
 * within CLERK_LOAD_TIMEOUT_MS.
 */
function waitForClerk(): Promise<ClerkClient> {
  const existing = $clerkStore.get();
  if (existing && $isLoadedStore.get()) {
    return Promise.resolve(existing);
  }

  return new Promise((resolve, reject) => {
    let unsubClerk = () => {};
    let unsubLoaded = () => {};
    const stop = () => {
      clearTimeout(timer);
      unsubClerk();
      unsubLoaded();
    };
    const timer = setTimeout(() => {
      stop();
      reject(new Error('Clerk did not load'));
    }, CLERK_LOAD_TIMEOUT_MS);

    const check = () => {
      const clerk = $clerkStore.get();
      if (clerk && $isLoadedStore.get()) {
        stop();
        resolve(clerk);
      }
    };

    unsubClerk = $clerkStore.listen(check);
    unsubLoaded = $isLoadedStore.listen(check);
    check();
  });
}

export async function getClerk(): Promise<ClerkClient> {
  return waitForClerk();
}

// Helper to get the current session token
export async function getSessionToken(): Promise<string | null> {
  if (DEV_FAKE_AUTH) {
    const fake = getFakeUser();
    if (fake) return fakeUserToken(fake);
  }
  try {
    const clerk = await waitForClerk();
    return (await clerk.session?.getToken()) ?? null;
  } catch (error) {
    console.error('Error getting session token:', error);
    return null;
  }
}

/**
 * `target` as a same-origin path to redirect to, or `fallback` when it's
 * missing or points anywhere else ("//host", "/\host", "javascript:", …).
 */
export function safeRedirectPath(target: string | null, fallback = '/trips'): string {
  if (!target) return fallback;
  try {
    const url = new URL(target, window.location.origin);
    if (url.origin === window.location.origin) return url.pathname + url.search + url.hash;
  } catch {
    // Unparseable: fall through to the fallback.
  }
  return fallback;
}

/**
 * Whether a user is signed in. Rejects if Clerk fails to load, so callers can
 * tell "signed out" apart from "couldn't find out".
 */
export async function isSignedIn(): Promise<boolean> {
  if (DEV_FAKE_AUTH && getFakeUser()) return true;
  const clerk = await waitForClerk();
  return !!clerk.user;
}

// Helper to get current user
export async function getCurrentUser(): Promise<ClerkClient['user']> {
  if (DEV_FAKE_AUTH) {
    const fake = getFakeUser();
    if (fake) {
      // Shaped like the subset of Clerk's UserResource that callers read.
      return {
        id: fake.id,
        primaryEmailAddress: { emailAddress: fake.email },
        firstName: fake.firstName ?? null,
        lastName: fake.lastName ?? null,
        imageUrl: '',
      } as unknown as ClerkClient['user'];
    }
  }
  try {
    const clerk = await waitForClerk();
    return clerk.user;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

// Sign out helper
export async function signOut(): Promise<void> {
  if (DEV_FAKE_AUTH && getFakeUser()) {
    clearFakeUser();
    return;
  }
  const clerk = await waitForClerk();
  await clerk.signOut();
}
