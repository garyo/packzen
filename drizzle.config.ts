import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'sqlite',
  // For local development, Wrangler handles D1 migrations
  // No credentials needed - migrations are applied via `wrangler d1 migrations apply`
});
