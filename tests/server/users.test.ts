/**
 * Tests for lib/server/db/users.ts — getOrCreateUser + resolveUserByAuthId
 *
 * Strategy: mock the Drizzle DB layer so no real Neon connection is required.
 * We test that the correct queries are issued with the right parameters.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be set up before importing the module under test
// ---------------------------------------------------------------------------

// Mock user row returned from DB
const mockUserRow = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  authProvider: 'clerk',
  authProviderId: 'user_abc123',
  email: 'test@example.com',
  displayName: 'Test User',
  avatarUrl: 'https://img.clerk.com/avatar.jpg',
  role: 'student',
  onboardingCompleted: false,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

// Track calls for assertions
let insertValues: unknown[] = [];
let onConflictCalls: { type: string; target?: unknown }[] = [];
let profileInserted = false;

// Build a mock db that tracks calls
function buildMockDb() {
  insertValues = [];
  onConflictCalls = [];
  profileInserted = false;

  const mockDb = {
    insert: vi.fn().mockImplementation(() => {
      return {
        values: vi.fn().mockImplementation((vals: unknown) => {
          insertValues.push(vals);
          return {
            onConflictDoUpdate: vi.fn().mockImplementation((opts: unknown) => {
              onConflictCalls.push({ type: 'doUpdate', target: opts });
              return {
                returning: vi.fn().mockResolvedValue([mockUserRow]),
              };
            }),
            onConflictDoNothing: vi.fn().mockImplementation((opts: unknown) => {
              onConflictCalls.push({ type: 'doNothing', target: opts });
              profileInserted = true;
              return Promise.resolve();
            }),
          };
        }),
      };
    }),

    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => ({
          limit: vi.fn().mockResolvedValue([mockUserRow]),
        })),
      })),
    })),

    // db.transaction(cb) — call cb with the same mock as the tx handle
    transaction: vi.fn().mockImplementation(async (cb: (tx: typeof mockDb) => Promise<unknown>) => {
      return cb(mockDb);
    }),
  };

  return mockDb;
}

let mockDb: ReturnType<typeof buildMockDb>;

// Mock the getDb function
vi.mock('@/lib/server/db/index', () => ({
  getDb: () => mockDb,
}));

// Pass-through: use the real schema objects so column refs stay in sync.
// See lib/server/db/schema.ts for the canonical definitions.
vi.mock('@/lib/server/db/schema', async () => {
  const real = await vi.importActual<typeof import('@/lib/server/db/schema')>('@/lib/server/db/schema');
  return { users: real.users, studentProfiles: real.studentProfiles };
});

// Import after mocks are set up
import { getOrCreateUser, resolveUserByAuthId } from '@/lib/server/db/users';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getOrCreateUser', () => {
  beforeEach(() => {
    mockDb = buildMockDb();
    vi.clearAllMocks();
  });

  it('creates a new user and returns row with role=student', async () => {
    const result = await getOrCreateUser({
      authProvider: 'clerk',
      authProviderId: 'user_abc123',
      email: 'test@example.com',
      displayName: 'Test User',
      avatarUrl: 'https://img.clerk.com/avatar.jpg',
    });

    expect(result).toEqual(mockUserRow);
    expect(result.role).toBe('student');
    expect(result.onboardingCompleted).toBe(false);
  });

  it('calls db.insert twice (users + student_profiles)', async () => {
    await getOrCreateUser({
      authProvider: 'clerk',
      authProviderId: 'user_abc123',
      email: 'test@example.com',
      displayName: 'Test User',
      avatarUrl: null,
    });

    // db.insert should be called exactly twice:
    // 1st for users table, 2nd for student_profiles
    expect(mockDb.insert).toHaveBeenCalledTimes(2);
  });

  it('passes correct values for users insert', async () => {
    await getOrCreateUser({
      authProvider: 'clerk',
      authProviderId: 'user_abc123',
      email: 'test@example.com',
      displayName: 'Test User',
      avatarUrl: null,
    });

    // First .values() call is for the users table
    expect(insertValues[0]).toEqual({
      authProvider: 'clerk',
      authProviderId: 'user_abc123',
      email: 'test@example.com',
      displayName: 'Test User',
      avatarUrl: null,
    });
  });

  it('creates a student_profiles row linked to the user', async () => {
    await getOrCreateUser({
      authProvider: 'clerk',
      authProviderId: 'user_abc123',
      email: 'test@example.com',
    });

    // Second .values() call is for student_profiles
    expect(insertValues.length).toBe(2);
    expect(insertValues[1]).toEqual({ userId: mockUserRow.id });
  });

  it('uses ON CONFLICT DO NOTHING for profile (idempotent)', async () => {
    await getOrCreateUser({
      authProvider: 'clerk',
      authProviderId: 'user_abc123',
    });

    // Should have both onConflictDoUpdate (users) and onConflictDoNothing (profiles)
    const doNothingCalls = onConflictCalls.filter(c => c.type === 'doNothing');
    expect(doNothingCalls.length).toBe(1);
    expect(profileInserted).toBe(true);
  });

  it('uses ON CONFLICT DO UPDATE for user upsert', async () => {
    await getOrCreateUser({
      authProvider: 'clerk',
      authProviderId: 'user_abc123',
      email: 'updated@example.com',
      displayName: 'Updated Name',
    });

    const doUpdateCalls = onConflictCalls.filter(c => c.type === 'doUpdate');
    expect(doUpdateCalls.length).toBe(1);
  });
});

describe('resolveUserByAuthId', () => {
  beforeEach(() => {
    mockDb = buildMockDb();
    vi.clearAllMocks();
  });

  it('returns user when found', async () => {
    const result = await resolveUserByAuthId('clerk', 'user_abc123');

    expect(result).toEqual(mockUserRow);
    expect(mockDb.select).toHaveBeenCalled();
  });

  it('returns null when user not found', async () => {
    // Override to return empty array
    mockDb.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const result = await resolveUserByAuthId('clerk', 'nonexistent_user');

    expect(result).toBeNull();
  });
});
