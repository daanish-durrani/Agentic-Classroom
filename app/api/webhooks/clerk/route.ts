/**
 * Clerk webhook handler — syncs user events to the internal `users` table.
 *
 * Verifies webhook signature using svix to prevent spoofing.
 * Creates/updates the internal user record on user.created / user.updated.
 */

import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { getOrCreateUser } from '@/lib/server/db/users';

// Clerk webhook event types we care about
interface ClerkEmailAddress {
  id: string;
  email_address: string;
}

interface ClerkUserEventData {
  id: string;
  email_addresses?: ClerkEmailAddress[];
  primary_email_address_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  image_url?: string | null;
}

interface ClerkWebhookEvent {
  type: string;
  data: ClerkUserEventData;
}

/**
 * Determine the user's primary email address from Clerk user event data.
 *
 * Returns `null` if `email_addresses` is missing or empty. If `primary_email_address_id`
 * is present, returns the matching `email_address` when found; otherwise returns the
 * `email_address` of the first entry in `email_addresses`.
 *
 * @param data - Clerk user event payload containing `email_addresses` and optional `primary_email_address_id`
 * @returns The primary email address, or `null` if none is available
 */
function getPrimaryEmail(data: ClerkUserEventData): string | null {
  if (!data.email_addresses?.length) return null;

  // Match against primary_email_address_id if available
  if (data.primary_email_address_id) {
    const primary = data.email_addresses.find(
      (e) => e.id === data.primary_email_address_id,
    );
    if (primary) return primary.email_address;
  }

  // Fallback: first email
  return data.email_addresses[0].email_address;
}

/**
 * Handle incoming Clerk webhook POSTs: verify Svix signature, process user events, and sync created/updated users to the internal users table.
 *
 * Processes `user.created` and `user.updated` by extracting the primary email, computing a display name, and calling the internal upsert routine; logs `user.deleted` events without performing hard deletes. Returns error responses for missing configuration, missing/invalid Svix headers, signature verification failures, or failures during user sync (which yield HTTP 500 to allow Clerk retries).
 *
 * @returns A NextResponse with a JSON payload indicating success (`{ received: true }`) or an error object (`{ error: string }`) and an appropriate HTTP status code.
 */
export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    console.error('CLERK_WEBHOOK_SECRET not set — rejecting webhook');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Get svix headers for verification
  const headerPayload = await headers();
  const svixId = headerPayload.get('svix-id');
  const svixTimestamp = headerPayload.get('svix-timestamp');
  const svixSignature = headerPayload.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing svix headers' }, { status: 400 });
  }

  // Get the raw body
  const payload = await req.text();

  // Verify the webhook signature
  const wh = new Webhook(WEBHOOK_SECRET);
  let event: ClerkWebhookEvent;

  try {
    event = wh.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkWebhookEvent;
  } catch (err) {
    console.error('Webhook verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Handle user events
  const { type, data } = event;

  if (type === 'user.created' || type === 'user.updated') {
    const primaryEmail = getPrimaryEmail(data);
    const displayName = [data.first_name, data.last_name].filter(Boolean).join(' ') || null;

    try {
      await getOrCreateUser({
        authProvider: 'clerk',
        authProviderId: data.id,
        email: primaryEmail,
        displayName,
        avatarUrl: data.image_url ?? null,
      });

      console.log(`[webhook] ${type}: synced user ${data.id} → internal users table`);
    } catch (err) {
      console.error(
        `[webhook] ${type} failed for user ${data.id} (email: ${primaryEmail}):`,
        err,
      );
      // Return 500 so Clerk retries on transient DB errors
      return NextResponse.json({ error: 'Failed to sync user' }, { status: 500 });
    }
  }

  // user.deleted — we don't hard-delete; could soft-delete in the future
  if (type === 'user.deleted') {
    console.log(`[webhook] user.deleted: ${data.id} — no action (soft-delete not implemented)`);
  }

  return NextResponse.json({ received: true });
}
