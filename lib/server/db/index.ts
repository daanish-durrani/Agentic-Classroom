/**
 * Drizzle ORM client — Neon serverless HTTP driver.
 *
 * Connection is lazy-initialized on first use to prevent build-time errors
 * when DATABASE_URL is not set (e.g. during `next build`).
 *
 * Usage:
 *   import { getDb } from '@/lib/server/db';
 *   const db = getDb();
 *   await db.select()...
 */

import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema';

let _db: NeonHttpDatabase<typeof schema> | null = null;

/**
 * Retrieves the cached Drizzle ORM database instance for Neon, initializing it on first call.
 *
 * Initializes and caches a Neon HTTP client wrapped by Drizzle on first invocation. Throws an error if the `DATABASE_URL` environment variable is not set.
 *
 * @returns The initialized Neon HTTP Drizzle database instance for the local schema.
 * @throws Error if `DATABASE_URL` is not set in the environment.
 */
export function getDb(): NeonHttpDatabase<typeof schema> {
  if (!_db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL environment variable is not set. Cannot connect to database.',
      );
    }
    const sql = neon(connectionString);
    _db = drizzle({ client: sql, schema });
  }
  return _db;
}
