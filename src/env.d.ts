/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

declare namespace App {
  interface Locals {
    userId: string;
    billingStatus?: import('./lib/billing').BillingStatus;
    runtime: {
      env: {
        DB: D1Database;
        CLERK_SECRET_KEY?: string;
      };
    };
  }
}
