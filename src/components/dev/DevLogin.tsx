import { createSignal, For, Show, onMount } from 'solid-js';
import {
  DEV_FAKE_AUTH,
  getFakeUser,
  setFakeUser,
  clearFakeUser,
  getFakeRoster,
  removeFromRoster,
  makeFakeUserId,
  type FakeUser,
} from '../../lib/dev-auth';
import type { BillingPlan } from '../../lib/billing';

function emailFor(id: string): string {
  return `${id.replace(/^devuser_/, '')}@example.test`;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

function buildUser(rawName: string, plan: BillingPlan, fresh: boolean): FakeUser {
  const base = makeFakeUserId(rawName);
  const id = fresh ? `${base}-${randomSuffix()}` : base;
  return {
    id,
    email: emailFor(id),
    firstName: rawName.trim().split(/\s+/)[0] || 'Dev',
    plan,
  };
}

// Full page reload so the auth store and every island re-initialize as the
// selected fake user.
function enter(user: FakeUser, redirect = '/dashboard'): void {
  setFakeUser(user);
  window.location.href = redirect;
}

export default function DevLogin() {
  const [roster, setRoster] = createSignal<FakeUser[]>([]);
  const [current, setCurrent] = createSignal<FakeUser | null>(null);
  const [name, setName] = createSignal('');
  const [plan, setPlan] = createSignal<BillingPlan>('standard');

  const refresh = () => {
    setRoster(getFakeRoster());
    setCurrent(getFakeUser());
  };

  onMount(() => {
    // Automation entry point:
    //   /dev/login?as=Alice[&new=1][&plan=free_user][&redirect=/some/path]
    const params = new URLSearchParams(window.location.search);
    const as = params.get('as');
    if (as) {
      const planParam: BillingPlan = params.get('plan') === 'free_user' ? 'free_user' : 'standard';
      const fresh = params.get('new') === '1';
      const redirect = params.get('redirect') || '/dashboard';
      enter(buildUser(as, planParam, fresh), redirect);
      return;
    }
    refresh();
  });

  const createUser = (fresh: boolean) => {
    const trimmed = name().trim();
    if (!trimmed) return;
    enter(buildUser(trimmed, plan(), fresh));
  };

  const signOutFake = () => {
    clearFakeUser();
    refresh();
  };

  const forget = (id: string) => {
    removeFromRoster(id);
    refresh();
  };

  return (
    <Show
      when={DEV_FAKE_AUTH}
      fallback={<p class="p-6 text-gray-600">Dev fake auth is disabled.</p>}
    >
      <div class="mx-auto max-w-md space-y-6 p-6">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Dev Login</h1>
          <p class="mt-1 text-sm text-gray-600">
            Fake users for local testing — no email verification. Each user has its own isolated
            data.
          </p>
        </div>

        <Show when={current()}>
          {(u) => (
            <div class="rounded-lg border border-green-200 bg-green-50 p-4">
              <p class="text-sm text-gray-600">Signed in as</p>
              <p class="font-medium text-gray-900">{u().email}</p>
              <p class="text-xs text-gray-500">
                {u().id} · {u().plan}
              </p>
              <div class="mt-3 flex gap-2">
                <a href="/dashboard" class="rounded bg-blue-600 px-3 py-1.5 text-sm text-white">
                  Go to app
                </a>
                <button
                  onClick={signOutFake}
                  class="rounded border border-gray-300 px-3 py-1.5 text-sm"
                >
                  Sign out
                </button>
              </div>
            </div>
          )}
        </Show>

        <div class="space-y-3 rounded-lg border border-gray-200 p-4">
          <h2 class="font-semibold text-gray-900">Create / sign in</h2>
          <input
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && createUser(false)}
            placeholder="Name (e.g. Alice)"
            class="w-full rounded border border-gray-300 px-3 py-2"
          />
          <select
            value={plan()}
            onChange={(e) => setPlan(e.currentTarget.value as BillingPlan)}
            class="w-full rounded border border-gray-300 px-3 py-2"
          >
            <option value="standard">standard (paid — no limits)</option>
            <option value="free_user">free_user (free-tier limits)</option>
          </select>
          <div class="flex gap-2">
            <button
              onClick={() => createUser(false)}
              class="flex-1 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Sign in
            </button>
            <button
              onClick={() => createUser(true)}
              title="Always a brand-new user id — use for the new-user flow"
              class="rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
            >
              New random
            </button>
          </div>
          <p class="text-xs text-gray-500">
            Same name → same data (return to a user). “New random” always makes a fresh user for the
            new-user flow.
          </p>
        </div>

        <Show when={roster().length > 0}>
          <div class="space-y-2 rounded-lg border border-gray-200 p-4">
            <h2 class="font-semibold text-gray-900">Recent users</h2>
            <For each={roster()}>
              {(u) => (
                <div class="flex items-center justify-between gap-2">
                  <button
                    onClick={() => enter(u)}
                    class="flex-1 truncate text-left text-sm text-blue-700 hover:underline"
                  >
                    {u.email} <span class="text-xs text-gray-500">· {u.plan}</span>
                  </button>
                  <button
                    onClick={() => forget(u.id)}
                    class="text-xs text-gray-400 hover:text-gray-600"
                  >
                    forget
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  );
}
