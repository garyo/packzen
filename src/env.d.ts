/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

interface ImportMetaEnv {
  // Opt-in for the dev-only fake auth flow. Only honored under `astro dev`
  // (import.meta.env.DEV); ignored in production builds. See src/lib/dev-auth.ts.
  readonly PUBLIC_DEV_FAKE_AUTH?: string;
}

declare namespace App {
  interface Locals {
    userId: string;
    billing?: import('./lib/billing').Billing;
  }
}

// Bindings and secrets on `env` from 'cloudflare:workers' (see wrangler.jsonc).
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    CLERK_WEBHOOK_SECRET?: string;
  }
}
