/**
 * AppNav Component
 *
 * The app's primary navigation: Trips · My Items · Account. A fixed bottom
 * tab bar on phones and a small floating bar on wider screens. Pages that
 * mount it get bottom padding from `--app-nav-height` (see global.css).
 */

import { createSignal, onMount, Show, type JSX } from 'solid-js';
import { authStore } from '../../stores/auth';
import { cn } from '../../lib/utils';
import { SuitcaseIcon, ListIcon, UserIcon } from '../ui/Icons';
import { AccountMenu } from './AccountMenu';
import { AboutModal } from './AboutModal';
import { OnboardingModal } from './OnboardingModal';

type Dialog = 'account' | 'help' | 'about' | null;

const tabClass =
  'flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium md:flex-none md:flex-row md:gap-2 md:rounded-full md:px-4 md:text-sm';
const activeClass = 'text-blue-600 md:bg-blue-50';
const inactiveClass = 'text-gray-600 hover:text-gray-900 md:hover:bg-gray-100';
const iconClass = 'h-6 w-6 md:h-5 md:w-5';

export function AppNav() {
  const [dialog, setDialog] = createSignal<Dialog>(null);
  const path = window.location.pathname;

  onMount(() => {
    // The Account dialog shows who's signed in; pages without their own
    // Solid root (e.g. /profile) don't initialize auth otherwise.
    if (!authStore.user()) void authStore.initAuth();
  });

  return (
    <>
      <nav
        aria-label="Main"
        class="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] md:inset-x-auto md:bottom-4 md:left-1/2 md:-translate-x-1/2 md:rounded-full md:border md:p-1 md:shadow-lg"
      >
        <div class="flex h-16 items-stretch md:h-auto md:gap-1">
          <NavLink
            href="/trips"
            active={path.startsWith('/trips')}
            icon={<SuitcaseIcon class={iconClass} />}
          >
            Trips
          </NavLink>
          <NavLink
            href="/all-items"
            active={path.startsWith('/all-items')}
            icon={<ListIcon class={iconClass} />}
          >
            My Items
          </NavLink>
          <button
            type="button"
            onClick={() => setDialog('account')}
            aria-haspopup="dialog"
            class={cn(tabClass, path.startsWith('/profile') ? activeClass : inactiveClass)}
          >
            <UserIcon class={iconClass} />
            Account
          </button>
        </div>
      </nav>

      <Show when={dialog() === 'account'}>
        <AccountMenu
          onClose={() => setDialog(null)}
          onShowHelp={() => setDialog('help')}
          onShowAbout={() => setDialog('about')}
        />
      </Show>
      <Show when={dialog() === 'help'}>
        <OnboardingModal onClose={() => setDialog(null)} />
      </Show>
      <Show when={dialog() === 'about'}>
        <AboutModal onClose={() => setDialog(null)} />
      </Show>
    </>
  );
}

function NavLink(props: {
  href: string;
  active: boolean;
  icon: JSX.Element;
  children: JSX.Element;
}) {
  return (
    <a
      href={props.href}
      aria-current={props.active ? 'page' : undefined}
      class={cn(tabClass, props.active ? activeClass : inactiveClass)}
    >
      {props.icon}
      {props.children}
    </a>
  );
}
