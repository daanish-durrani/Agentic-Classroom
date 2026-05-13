/**
 * Server-side auth helpers.
 *
 * `ensureDbUser()` syncs the current Clerk session user to the internal
 * `users` + `student_profiles` tables on every authenticated request.
 * This is the primary creation path — the Clerk webhook is a secondary
 * backup for cases where the request path doesn't call this helper.
 *
 * The operation is idempotent (ON CONFLICT DO UPDATE / DO NOTHING),
 * so calling it on every request is safe and cheap.
 */

import { currentUser, auth } from '@clerk/nextjs/server';
import { getOrCreateUser, type InternalUser } from './db/users';

/**
 * Ensure the currently authenticated Clerk user has a row in the
 * internal `users` and `student_profiles` tables. Returns the
 * internal user record, or null if not authenticated.
 *
 * Call this at the top of any server component, API route, or
 * server action that needs the internal user ID.
 */
export async function ensureDbUser(): Promise<InternalUser | null> {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  const clerkUser = await currentUser();

  if (!clerkUser) {
    return null;
  }

  // Extract primary email
  const primaryEmail =
    clerkUser.emailAddresses?.find((e) => e.id === clerkUser.primaryEmailAddressId)
      ?.emailAddress ?? clerkUser.emailAddresses?.[0]?.emailAddress ?? null;

  const displayName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || null;

  return getOrCreateUser({
    authProvider: 'clerk',
    authProviderId: clerkUser.id,
    email: primaryEmail,
    displayName,
    avatarUrl: clerkUser.imageUrl ?? null,
  });
}
