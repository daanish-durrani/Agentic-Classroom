/**
 * React hook that syncs the current Clerk user to the internal DB
 * by calling GET /api/me on mount.
 *
 * This ensures that even if the Clerk webhook didn't fire (e.g. local dev),
 * the user row + student_profiles row exist in Neon.
 *
 * Safe to call on every page load — the endpoint is idempotent.
 *
 * Tracks the synced userId so it re-fires when a different user signs in
 * (e.g. sign-out → sign-in with another account).
 * Uses AbortController for cleanup and a SYNCING sentinel to prevent
 * duplicate in-flight fetches.
 */

'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';

const SYNCING = '__syncing__';

export function useSyncUser() {
  const { isSignedIn, userId } = useAuth();
  const syncedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!isSignedIn || !userId) return;
    // Already synced or currently syncing this user
    if (syncedUserId.current === userId || syncedUserId.current === SYNCING) return;

    // Optimistically mark as syncing to prevent duplicate fetches
    syncedUserId.current = SYNCING;

    const controller = new AbortController();

    fetch('/api/me', { signal: controller.signal })
      .then((res) => {
        if (controller.signal.aborted) return;
        if (res.ok) {
          syncedUserId.current = userId;
        } else {
          // Revert so the next render retries
          syncedUserId.current = null;
          console.warn('[useSyncUser] Failed to sync user:', res.status);
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        // Revert so the next render retries
        syncedUserId.current = null;
        console.warn('[useSyncUser] Network error syncing user:', err);
      });

    return () => {
      controller.abort();
      // If we were mid-flight, revert so re-mount retries
      if (syncedUserId.current === SYNCING) {
        syncedUserId.current = null;
      }
    };
  }, [isSignedIn, userId]);
}
