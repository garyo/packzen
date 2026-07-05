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

/**
 * Resolve once the @clerk/astro client exists and has finished loading.
 * Returns immediately if Clerk is already loaded.
 */
function waitForClerk(): Promise<ClerkClient> {
  const existing = $clerkStore.get();
  if (existing && $isLoadedStore.get()) {
    return Promise.resolve(existing);
  }

  return new Promise((resolve) => {
    let unsubClerk = () => {};
    let unsubLoaded = () => {};

    const check = () => {
      const clerk = $clerkStore.get();
      if (clerk && $isLoadedStore.get()) {
        unsubClerk();
        unsubLoaded();
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

// Helper to check if user is signed in
export async function isSignedIn(): Promise<boolean> {
  if (DEV_FAKE_AUTH && getFakeUser()) return true;
  try {
    const clerk = await waitForClerk();
    return !!clerk.user;
  } catch (error) {
    console.error('Error checking sign-in state:', error);
    return false;
  }
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
