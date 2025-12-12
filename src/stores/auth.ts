import { createSignal, createEffect } from 'solid-js';
import { getClerk, getCurrentUser, signOut as clerkSignOut } from '../lib/clerk';
import type { User } from '../lib/types';

// Auth state
const [user, setUser] = createSignal<User | null>(null);
const [isLoading, setIsLoading] = createSignal(true);
const [isAuthenticated, setIsAuthenticated] = createSignal(false);

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
    await clerkSignOut();
    setUser(null);
    setIsAuthenticated(false);
    window.location.href = '/';
  } catch (error) {
    console.error('Failed to sign out:', error);
  }
}

// Export auth store
export const authStore = {
  user,
  isLoading,
  isAuthenticated,
  initAuth,
  signOut,
};
