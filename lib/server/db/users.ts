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
 * Looks up an internal user record matching the given authentication provider and provider-specific user ID.
 *
 * @param provider - The external auth provider identifier (e.g., "google", "github")
 * @param providerUserId - The user ID assigned by the external provider
 * @returns The matching `InternalUser` if found, `null` otherwise
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
 * Insert or update an internal user record from external auth-provider webhook data.
 *
 * Performs an atomic upsert keyed by `authProvider` and `authProviderId` so concurrent webhook retries
 * resolve to a single user record.
 *
 * @param data - Webhook-provided user data. `authProvider` and `authProviderId` are required identifiers for the external identity. `email`, `displayName`, and `avatarUrl` are optional profile fields to set or update.
 * @returns The resulting user row (inserted or updated) from the `users` table.
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
