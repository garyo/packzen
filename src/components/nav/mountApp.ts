import type { JSX } from 'solid-js';
import { render } from 'solid-js/web';
import { isSignedIn } from '../../lib/clerk';
import { Toast } from '../ui/Toast';
import { AppNav } from './AppNav';

/**
 * Client-side auth gate for pages built on AppLayout (static output, so there
 * is no server guard). While Clerk loads, #app-root shows the layout's static
 * spinner; then this redirects signed-out visitors to sign-in, or replaces the
 * spinner with `page` and mounts the toast host and the nav (if the layout has
 * a slot for it). If Clerk never loads, it shows the layout's "Retry" message
 * instead.
 *
 * Without `page`, #app-root keeps its server-rendered content.
 */
export async function mountApp(page?: () => JSX.Element): Promise<void> {
  const root = document.getElementById('app-root');
  if (!root) return;

  let signedIn: boolean;
  try {
    signedIn = await isSignedIn();
  } catch (error) {
    console.error('Auth check failed:', error);
    root.hidden = true;
    document.getElementById('app-load-error')?.removeAttribute('hidden');
    return;
  }

  if (!signedIn) {
    const path = window.location.pathname + window.location.search;
    window.location.replace(`/sign-in?redirect_url=${encodeURIComponent(path)}`);
    return;
  }

  // The one toast host for the page (it portals itself to <body>).
  render(Toast, document.body.appendChild(document.createElement('div')));
  if (page) {
    root.replaceChildren();
    render(page, root);
  }
  const nav = document.getElementById('app-nav');
  if (nav) render(AppNav, nav);
}
