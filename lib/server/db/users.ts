/**
 * User resolver — auth-provider-agnostic identity lookup.
 *
 * All business logic should use the internal `users.id` (UUID),
 * never the external auth provider ID directly. This allows
 * migrating from Clerk to another provider without touching FKs.
 */

import { eq, and } from 'drizzle-orm';
import { getDb } from './index';
import { users } from './schema';

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
 * Upsert a user from webhook data.
 * Atomic: uses ON CONFLICT DO UPDATE to prevent race conditions
 * when Clerk retries webhooks concurrently.
 */
export async function getOrCreateUser(data: {
  authProvider: string;
  authProviderId: string;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}): Promise<InternalUser> {
  const db = getDb();

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

  return result;
}
