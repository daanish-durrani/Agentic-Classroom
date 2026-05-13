/**
 * GET /api/me — sync current Clerk user to internal DB and return profile.
 *
 * This is the primary user-creation path. The Clerk webhook is a
 * secondary backup. Calling this endpoint is idempotent.
 */

import { NextResponse } from 'next/server';
import { ensureDbUser } from '@/lib/server/auth';

export async function GET() {
  try {
    const user = await ensureDbUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    });
  } catch (err: unknown) {
    const safeMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[api/me] Failed to sync user:', safeMessage);
    return NextResponse.json({ error: 'Failed to sync user' }, { status: 500 });
  }
}
