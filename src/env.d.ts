/// <reference types="astro/client" />

import type { BillingStatus } from './lib/billing';

declare namespace App {
  interface Locals {
    userId: string;
    billingStatus?: BillingStatus;
    runtime: {
      env: {
        DB: D1Database;
        CLERK_SECRET_KEY?: string;
      };
    };
  }
}
