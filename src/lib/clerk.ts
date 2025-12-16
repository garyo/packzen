import { Clerk } from '@clerk/clerk-js';

// Get the publishable key from environment variables
const clerkPubKey = import.meta.env.PUBLIC_CLERK_PUBLISHABLE_KEY;

if (!clerkPubKey) {
  throw new Error('Missing PUBLIC_CLERK_PUBLISHABLE_KEY environment variable');
}

// Initialize Clerk
let clerkInstance: Clerk | null = null;

export async function getClerk(): Promise<Clerk> {
  if (clerkInstance) {
    return clerkInstance;
  }

  clerkInstance = new Clerk(clerkPubKey);
  await clerkInstance.load();

  return clerkInstance;
}

// Helper to get the current session token
export async function getSessionToken(): Promise<string | null> {
  try {
    const clerk = await getClerk();

    // Wait for Clerk to be fully loaded
    if (!clerk.loaded) {
      await clerk.load();
    }

    return (await clerk.session?.getToken()) ?? null;
  } catch (error) {
    console.error('Error getting session token:', error);
    return null;
  }
}

// Helper to check if user is signed in
export async function isSignedIn(): Promise<boolean> {
  const clerk = await getClerk();
  return !!clerk.user;
}

// Helper to get current user
export async function getCurrentUser() {
  const clerk = await getClerk();

  // Ensure Clerk is fully loaded
  if (!clerk.loaded) {
    await clerk.load();
  }

  return clerk.user;
}

// Sign out helper
export async function signOut() {
  const clerk = await getClerk();
  await clerk.signOut();
}
