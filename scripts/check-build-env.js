/**
 * Fail the build if the Clerk publishable key is missing. Static pages bake it
 * in at build time; without it sign-in never loads, and nothing else notices.
 */
import { loadEnv } from 'vite';

const env = { ...loadEnv('production', process.cwd(), 'PUBLIC_'), ...process.env };
if (!env.PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_')) {
  console.error('✗ PUBLIC_CLERK_PUBLISHABLE_KEY is not set; sign-in would not load.');
  process.exit(1);
}
console.log('✓ Clerk publishable key present');
