import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../../db/schema';

export interface Env {
  DB: D1Database;
  PUBLIC_CLERK_PUBLISHABLE_KEY: string;
  CLERK_SECRET_KEY: string;
}

export function getDb(env: Env) {
  return drizzle(env.DB, { schema });
}
