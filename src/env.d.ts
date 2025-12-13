/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    userId: string;
    runtime: {
      env: {
        DB: D1Database;
        CLERK_SECRET_KEY?: string;
      };
    };
  }
}
