// Dev-only fake authentication.
//
// This exists so new-user and multi-user flows can be exercised (by hand and by
// automation) without going through Clerk's real sign-up + email verification.
//
// SAFETY: every branch that trusts a fake identity is gated on DEV_FAKE_AUTH,
// which requires `import.meta.env.DEV` (false in any `astro build`) and an
// explicit opt-in with PUBLIC_DEV_FAKE_AUTH=true. It cannot be turned on in
// production. The server-side trust point, middleware.ts, also checks
// `import.meta.env.DEV` inline, which the build replaces with `false`, so the
// fake-token parsing is removed from the production Worker entirely.
//
// "Available" (DEV_FAKE_AUTH) is distinct from "active": fake auth only
// overrides real Clerk once a fake user has actually been selected (getFakeUser
// returns non-null). With the gate on but no fake user chosen, real Clerk login
// keeps working normally — so this never gets in the way of ordinary dev.

import type { BillingPlan } from './billing';

// The `typeof` guard is for non-Vite runtimes (the tsx test runner) where
// `import.meta.env` is undefined. It also stops the build from replacing
// these reads with literals, so DEV_FAKE_AUTH is a runtime `false` in
// production rather than a compile-time one.
export const DEV_FAKE_AUTH: boolean =
  typeof import.meta.env !== 'undefined' &&
  import.meta.env.DEV === true &&
  import.meta.env.PUBLIC_DEV_FAKE_AUTH === 'true';

export interface FakeUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  plan: BillingPlan;
}

const TOKEN_PREFIX = 'devfake:';
const CURRENT_KEY = 'packzen-dev-fake-user';
const ROSTER_KEY = 'packzen-dev-fake-roster';
const ROSTER_LIMIT = 20;

// --- token (isomorphic) -----------------------------------------------------

// The plan rides along in the token so the server can honor free-vs-standard
// limits without a lookup. id is `devuser_<slug>` (no `~`), plan has no `~`.
export function fakeUserToken(user: FakeUser): string {
  return `${TOKEN_PREFIX}${user.id}~${user.plan}`;
}

// Server side: extract the fake identity from an Authorization header, or null
// when fake auth is unavailable or the header isn't a fake-user bearer token.
export function parseFakeAuth(
  authHeader: string | null | undefined
): { userId: string; plan: BillingPlan } | null {
  if (!DEV_FAKE_AUTH || !authHeader) return null;
  const match = /^Bearer\s+devfake:([^~\s]+)~([a-z_]+)$/i.exec(authHeader);
  if (!match) return null;
  const plan: BillingPlan = match[2] === 'standard' ? 'standard' : 'free_user';
  return { userId: match[1], plan };
}

// --- client session (localStorage) ------------------------------------------

function readJSON<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// The currently signed-in fake user, or null when none is selected (in which
// case real Clerk is in charge).
export function getFakeUser(): FakeUser | null {
  if (!DEV_FAKE_AUTH) return null;
  return readJSON<FakeUser | null>(CURRENT_KEY, null);
}

export function setFakeUser(user: FakeUser): void {
  if (!DEV_FAKE_AUTH || typeof localStorage === 'undefined') return;
  localStorage.setItem(CURRENT_KEY, JSON.stringify(user));
  // Keep a most-recent-first roster so you can switch back to a user later.
  const roster = [user, ...getFakeRoster().filter((u) => u.id !== user.id)];
  localStorage.setItem(ROSTER_KEY, JSON.stringify(roster.slice(0, ROSTER_LIMIT)));
}

export function clearFakeUser(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(CURRENT_KEY);
}

export function getFakeRoster(): FakeUser[] {
  return readJSON<FakeUser[]>(ROSTER_KEY, []);
}

export function removeFromRoster(id: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(ROSTER_KEY, JSON.stringify(getFakeRoster().filter((u) => u.id !== id)));
}

// Stable id from a display name, so re-entering the same name returns to the
// same data. `devuser_` prefix keeps fake ids visually distinct from Clerk's.
export function makeFakeUserId(name: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'user';
  return `devuser_${slug}`;
}
