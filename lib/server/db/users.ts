/**
 * User resolver — auth-provider-agnostic identity lookup.
 *
 * All business logic should use the internal `users.id` (UUID),
 * never the external auth provider ID directly. This allows
 * migrating from Clerk to another provider without touching FKs.
 */

import { eq, and } from 'drizzle-orm';
import { getDb } from './index';
import { users, studentProfiles } from './schema';

export type InternalUser = typeof users.$inferSelect;

/**
 * Resolve an auth provider's user ID to the internal users.id.
 * Returns null if the user doesn't exist yet.
 */
export async function resolveUserByAuthId(
  provider: string,
  providerUserId: string,
): Promise<InternalUser | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.authProvider, provider), eq(users.authProviderId, providerUserId)))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Upsert a user from webhook data, and ensure a student_profiles row exists.
 *
 * Uses ON CONFLICT DO UPDATE to prevent race conditions when Clerk retries
 * webhooks concurrently.
 *
 * Profile creation uses ON CONFLICT DO NOTHING so it's idempotent —
 * calling this multiple times for the same user never duplicates the profile.
 * Every user starts as role='student', so all users get a profile row.
 *
 * Note: Neon HTTP driver does not support transactions, so the two inserts
 * run sequentially. Both are idempotent, so partial failure on the profile
 * insert is self-healing on the next call.
 */
export async function getOrCreateUser(data: {
  authProvider: string;
  authProviderId: string;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}): Promise<InternalUser> {
  const db = getDb();

  // Step 1: Upsert the user row
  const [result] = await db
    .insert(users)
    .values({
      authProvider: data.authProvider,
      authProviderId: data.authProviderId,
      email: data.email,
      displayName: data.displayName,
      avatarUrl: data.avatarUrl,
    })
    .onConflictDoUpdate({
      target: [users.authProvider, users.authProviderId],
      set: {
        email: data.email,
        displayName: data.displayName,
        avatarUrl: data.avatarUrl,
      },
    })
    .returning();

  // Step 2: Ensure a student_profiles row exists for this user.
  // ON CONFLICT DO NOTHING: safe for webhook retries and concurrent calls.
  await db
    .insert(studentProfiles)
    .values({ userId: result.id })
    .onConflictDoNothing({ target: studentProfiles.userId });

  return result;
}
