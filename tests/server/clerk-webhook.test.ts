/**
 * Tests for app/api/webhooks/clerk/route.ts — Clerk webhook handler
 *
 * Strategy: mock svix Webhook.verify(), getOrCreateUser(), and next/headers
 * so we can test the route handler logic without real Clerk/Neon connections.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetOrCreateUser = vi.fn();
vi.mock('@/lib/server/db/users', () => ({
  getOrCreateUser: (...args: unknown[]) => mockGetOrCreateUser(...args),
}));

const mockVerify = vi.fn();
vi.mock('svix', () => {
  return {
    Webhook: class MockWebhook {
      verify(...args: unknown[]) {
        return mockVerify(...args);
      }
    },
  };
});

// Mock next/headers
const mockHeaders = new Map<string, string>();
vi.mock('next/headers', () => ({
  headers: vi.fn().mockImplementation(async () => ({
    get: (key: string) => mockHeaders.get(key) ?? null,
  })),
}));

// Import after mocks
import { POST } from '@/app/api/webhooks/clerk/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function setSvixHeaders() {
  mockHeaders.set('svix-id', 'msg_test123');
  mockHeaders.set('svix-timestamp', '1234567890');
  mockHeaders.set('svix-signature', 'v1,test_signature');
}

function clearSvixHeaders() {
  mockHeaders.clear();
}

const sampleUserCreatedPayload = {
  type: 'user.created',
  data: {
    id: 'user_clerk_abc123',
    email_addresses: [
      { id: 'email_1', email_address: 'student@university.edu' },
    ],
    primary_email_address_id: 'email_1',
    first_name: 'Test',
    last_name: 'Student',
    image_url: 'https://img.clerk.com/avatar.jpg',
  },
};

const sampleUserUpdatedPayload = {
  type: 'user.updated',
  data: {
    id: 'user_clerk_abc123',
    email_addresses: [
      { id: 'email_1', email_address: 'newemail@university.edu' },
    ],
    primary_email_address_id: 'email_1',
    first_name: 'Updated',
    last_name: 'Name',
    image_url: 'https://img.clerk.com/new-avatar.jpg',
  },
};

function makeRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/webhooks/clerk', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/webhooks/clerk', () => {
  const originalSecret = process.env.CLERK_WEBHOOK_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    clearSvixHeaders();
    setEnv('CLERK_WEBHOOK_SECRET', 'whsec_test_secret');
    mockGetOrCreateUser.mockResolvedValue({
      id: '550e8400-e29b-41d4-a716-446655440000',
      role: 'student',
    });
  });

  afterEach(() => {
    setEnv('CLERK_WEBHOOK_SECRET', originalSecret);
  });

  it('returns 500 when CLERK_WEBHOOK_SECRET is not set', async () => {
    setEnv('CLERK_WEBHOOK_SECRET', undefined);

    const req = makeRequest(sampleUserCreatedPayload);
    const response = await POST(req);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toContain('Webhook secret not configured');
  });

  it('returns 400 when svix headers are missing', async () => {
    // Don't set svix headers
    const req = makeRequest(sampleUserCreatedPayload);
    const response = await POST(req);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Missing svix headers');
  });

  it('returns 400 when svix signature is invalid', async () => {
    setSvixHeaders();
    mockVerify.mockImplementation(() => {
      throw new Error('Invalid signature');
    });

    const req = makeRequest(sampleUserCreatedPayload);
    const response = await POST(req);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Invalid signature');
  });

  it('returns 200 and calls getOrCreateUser on user.created', async () => {
    setSvixHeaders();
    mockVerify.mockReturnValue(sampleUserCreatedPayload);

    const req = makeRequest(sampleUserCreatedPayload);
    const response = await POST(req);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.received).toBe(true);

    expect(mockGetOrCreateUser).toHaveBeenCalledWith({
      authProvider: 'clerk',
      authProviderId: 'user_clerk_abc123',
      email: 'student@university.edu',
      displayName: 'Test Student',
      avatarUrl: 'https://img.clerk.com/avatar.jpg',
    });
  });

  it('returns 200 and calls getOrCreateUser on user.updated', async () => {
    setSvixHeaders();
    mockVerify.mockReturnValue(sampleUserUpdatedPayload);

    const req = makeRequest(sampleUserUpdatedPayload);
    const response = await POST(req);

    expect(response.status).toBe(200);

    expect(mockGetOrCreateUser).toHaveBeenCalledWith({
      authProvider: 'clerk',
      authProviderId: 'user_clerk_abc123',
      email: 'newemail@university.edu',
      displayName: 'Updated Name',
      avatarUrl: 'https://img.clerk.com/new-avatar.jpg',
    });
  });

  it('returns 200 and does not call getOrCreateUser on user.deleted', async () => {
    setSvixHeaders();
    const deletedPayload = { type: 'user.deleted', data: { id: 'user_clerk_abc123' } };
    mockVerify.mockReturnValue(deletedPayload);

    const req = makeRequest(deletedPayload);
    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(mockGetOrCreateUser).not.toHaveBeenCalled();
  });

  it('returns 500 when getOrCreateUser throws (so Clerk retries)', async () => {
    setSvixHeaders();
    mockVerify.mockReturnValue(sampleUserCreatedPayload);
    mockGetOrCreateUser.mockRejectedValue(new Error('DB connection failed'));

    const req = makeRequest(sampleUserCreatedPayload);
    const response = await POST(req);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toContain('Failed to sync user');
  });

  it('extracts primary email correctly when multiple emails exist', async () => {
    setSvixHeaders();
    const multiEmailPayload = {
      type: 'user.created',
      data: {
        id: 'user_multi_email',
        email_addresses: [
          { id: 'email_secondary', email_address: 'secondary@example.com' },
          { id: 'email_primary', email_address: 'primary@example.com' },
        ],
        primary_email_address_id: 'email_primary',
        first_name: 'Multi',
        last_name: null,
        image_url: null,
      },
    };
    mockVerify.mockReturnValue(multiEmailPayload);

    const req = makeRequest(multiEmailPayload);
    await POST(req);

    expect(mockGetOrCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'primary@example.com',
        displayName: 'Multi',
        avatarUrl: null,
      }),
    );
  });
});
