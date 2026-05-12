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
 * Get the Drizzle database instance. Lazy-initializes on first call.
 * Throws if DATABASE_URL is not set (runtime only, never at build time).
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
