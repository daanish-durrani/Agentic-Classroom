/**
 * Auth mode detection — single source of truth.
 *
 * Centralizes Clerk configuration detection so middleware,
 * layout, and pages all agree on the current auth mode.
 *
 * This module is server-only — it reads CLERK_SECRET_KEY which
 * must never be exposed to the client bundle.
 *
 * Rules:
 *  - Both CLERK_SECRET_KEY and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must be set
 *    for Clerk mode to activate.
 *  - If only one is set, throws at import time to fail fast.
 */

import 'server-only';

const secretKey = process.env.CLERK_SECRET_KEY;
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

// Fail fast on partial Clerk config
if ((secretKey && !publishableKey) || (!secretKey && publishableKey)) {
  throw new Error(
    'Partial Clerk configuration detected. Both CLERK_SECRET_KEY and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must be set together, or both must be unset.',
  );
}

/** True when Clerk is fully configured (both keys present) */
export const isClerkEnabled: boolean = !!(secretKey && publishableKey);
