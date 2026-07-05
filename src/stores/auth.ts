import { createSignal } from 'solid-js';
import { getClerk, getCurrentUser, signOut as clerkSignOut } from '../lib/clerk';
import { scheduleSignInRedirect } from '../lib/api';
import type { User } from '../lib/types';

// Auth state
const [user, setUser] = createSignal<User | null>(null);
const [isLoading, setIsLoading] = createSignal(true);
const [isAuthenticated, setIsAuthenticated] = createSignal(false);

// True while our own `signOut()` is in flight, so the session-change listener
// below doesn't also schedule a redirect on top of the one it triggers.
let isSigningOut = false;

// Set once we've subscribed to Clerk session changes, so re-running initAuth
// (e.g. remounting a page component) doesn't stack duplicate listeners.
let unsubscribeSessionListener: (() => void) | null = null;

// Initialize auth state
async function initAuth() {
  try {
    setIsLoading(true);
    const clerk = await getClerk();
    const clerkUser = await getCurrentUser();

    if (clerkUser) {
      setUser({
        id: clerkUser.id,
        email: clerkUser.primaryEmailAddress?.emailAddress || '',
        firstName: clerkUser.firstName || undefined,
        lastName: clerkUser.lastName || undefined,
        imageUrl: clerkUser.imageUrl || undefined,
      });
      setIsAuthenticated(true);
    } else {
      setUser(null);
      setIsAuthenticated(false);
    }

    // React to session changes that happen outside this tab's own API calls
    // (e.g. signed out in another tab, or the session expires server-side),
    // instead of leaving stale UI until the next request happens to 401.
    if (!unsubscribeSessionListener) {
      unsubscribeSessionListener = clerk.addListener(({ session }) => {
        if (!session && isAuthenticated() && !isSigningOut) {
          setUser(null);
          setIsAuthenticated(false);
          scheduleSignInRedirect();
        }
      });
    }
  } catch (error) {
    console.error('Failed to initialize auth:', error);
    setUser(null);
    setIsAuthenticated(false);
  } finally {
    setIsLoading(false);
  }
}

// Sign out
async function signOut() {
  try {
    isSigningOut = true;
    await clerkSignOut();
    setUser(null);
    setIsAuthenticated(false);
    window.location.href = '/';
  } catch (error) {
    console.error('Failed to sign out:', error);
  } finally {
    isSigningOut = false;
  }
}

// Tear down the Clerk session listener, e.g. before a full auth re-init.
function cleanup() {
  unsubscribeSessionListener?.();
  unsubscribeSessionListener = null;
}

// Export auth store
export const authStore = {
  user,
  isLoading,
  isAuthenticated,
  initAuth,
  signOut,
  cleanup,
};
