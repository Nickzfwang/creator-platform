/**
 * Membership API E2E Tests
 *
 * Tests against the live API server (http://localhost:4000).
 * Covers: tier CRUD, subscribe, members list, my memberships, cancel, connect, auth guards.
 */

const MS_API_BASE = 'http://localhost:4000/api/v1';

async function msApiRequest(
  path: string,
  options: { method?: string; body?: object; token?: string } = {},
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;

  const res = await fetch(`${MS_API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : undefined;
  return { status: res.status, data };
}

async function msRegisterUser(prefix: string): Promise<{ token: string; userId: string }> {
  const email = `e2e-ms-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`;
  const res = await msApiRequest('/auth/register', {
    method: 'POST',
    body: { email, password: 'Test1234', displayName: `MS ${prefix} Tester` },
  });
  return { token: res.data.accessToken, userId: res.data.user.id };
}

describe('Membership API E2E', () => {
  let creator: { token: string; userId: string };
  let fan: { token: string; userId: string };

  beforeAll(async () => {
    [creator, fan] = await Promise.all([
      msRegisterUser('creator'),
      msRegisterUser('fan'),
    ]);
  }, 15000);

  // ─── Authentication Guards ───

  describe('Authentication checks', () => {
    it('GET /membership/tiers should return 401 without token', async () => {
      const res = await msApiRequest('/membership/tiers');
      expect(res.status).toBe(401);
    });

    it('POST /membership/tiers should return 401 without token', async () => {
      const res = await msApiRequest('/membership/tiers', {
        method: 'POST',
        body: { name: 'Test', priceMonthly: 99 },
      });
      expect(res.status).toBe(401);
    });

    it('POST /membership/subscribe should return 401 without token', async () => {
      const res = await msApiRequest('/membership/subscribe', {
        method: 'POST',
        body: { tierId: '00000000-0000-0000-0000-000000000000' },
      });
      expect(res.status).toBe(401);
    });

    it('GET /membership/members should return 401 without token', async () => {
      const res = await msApiRequest('/membership/members');
      expect(res.status).toBe(401);
    });

    it('GET /membership/my should return 401 without token', async () => {
      const res = await msApiRequest('/membership/my');
      expect(res.status).toBe(401);
    });

    it('GET /membership/connect/status should return 401 without token', async () => {
      const res = await msApiRequest('/membership/connect/status');
      expect(res.status).toBe(401);
    });
  });

  // ─── Tier CRUD ───

  let createdTierId: string;

  describe('Tier lifecycle', () => {
    it('POST /membership/tiers should create a tier', async () => {
      const res = await msApiRequest('/membership/tiers', {
        method: 'POST',
        token: creator.token,
        body: {
          name: 'E2E Basic',
          description: 'E2E test tier',
          priceMonthly: 99,
          benefits: ['Access to posts', 'Monthly Q&A'],
        },
      });

      expect(res.status).toBe(201);
      expect(res.data.name).toBe('E2E Basic');
      expect(res.data.priceMonthly).toBe(99);
      expect(res.data.isActive).toBe(true);
      expect(res.data.benefits).toEqual(['Access to posts', 'Monthly Q&A']);
      createdTierId = res.data.id;
    });

    it('GET /membership/tiers should list creator tiers', async () => {
      const res = await msApiRequest('/membership/tiers', { token: creator.token });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
      expect(res.data.length).toBeGreaterThanOrEqual(1);
      expect(res.data.find((t: any) => t.id === createdTierId)).toBeTruthy();
    });

    it('GET /membership/tiers/public/:creatorUserId should list active tiers', async () => {
      const res = await msApiRequest(`/membership/tiers/public/${creator.userId}`, {
        token: fan.token,
      });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
    });

    it('PATCH /membership/tiers/:id should update tier', async () => {
      const res = await msApiRequest(`/membership/tiers/${createdTierId}`, {
        method: 'PATCH',
        token: creator.token,
        body: { name: 'E2E Premium', priceMonthly: 199 },
      });

      expect(res.status).toBe(200);
      expect(res.data.name).toBe('E2E Premium');
      expect(res.data.priceMonthly).toBe(199);
    });

    it('PATCH /membership/tiers/:id should return 404 for non-existent tier', async () => {
      const res = await msApiRequest('/membership/tiers/00000000-0000-0000-0000-000000000000', {
        method: 'PATCH',
        token: creator.token,
        body: { name: 'Ghost' },
      });

      expect(res.status).toBe(404);
    });
  });

  // ─── Subscribe (no-Stripe path) ───
  // Note: Each registered user gets their own tenant. subscribe() checks tier.tenantId === user.tenantId.
  // So we use a second user in the SAME tenant (creator registers a fan-like user),
  // or the creator subscribes to their own tier to test the flow.
  // Here we use creator as self-subscriber since cross-tenant is expected to 403.

  let membershipId: string;

  describe('Subscribe flow', () => {
    it('POST /membership/subscribe should create membership (no Stripe, same tenant)', async () => {
      const res = await msApiRequest('/membership/subscribe', {
        method: 'POST',
        token: creator.token,
        body: { tierId: createdTierId },
      });

      expect(res.status).toBe(201);
      expect(res.data.checkoutUrl).toBeNull(); // no Stripe
      expect(res.data.membershipId).toBeDefined();
      expect(res.data.tier.name).toBe('E2E Premium');
      membershipId = res.data.membershipId;
    });

    it('POST /membership/subscribe should reject duplicate subscription', async () => {
      const res = await msApiRequest('/membership/subscribe', {
        method: 'POST',
        token: creator.token,
        body: { tierId: createdTierId },
      });

      expect(res.status).toBe(409); // ConflictException
    });

    it('POST /membership/subscribe should reject cross-tenant subscription', async () => {
      const res = await msApiRequest('/membership/subscribe', {
        method: 'POST',
        token: fan.token,
        body: { tierId: createdTierId },
      });

      expect(res.status).toBe(403); // Different tenant
    });

    it('POST /membership/subscribe should reject non-existent tier', async () => {
      const res = await msApiRequest('/membership/subscribe', {
        method: 'POST',
        token: fan.token,
        body: { tierId: '00000000-0000-0000-0000-000000000000' },
      });

      expect(res.status).toBe(404);
    });
  });

  // ─── Members List ───
  // Creator self-subscribed, so they appear as both creator and member

  describe('Members list', () => {
    it('GET /membership/members should return members for creator', async () => {
      const res = await msApiRequest('/membership/members', { token: creator.token });

      expect(res.status).toBe(200);
      expect(res.data.data).toBeDefined();
      expect(res.data.hasMore).toBeDefined();
      expect(res.data.data.length).toBeGreaterThanOrEqual(1);
      expect(res.data.data[0].fan).toBeDefined();
      expect(res.data.data[0].tier).toBeDefined();
    });

    it('GET /membership/members?limit=1 should respect limit', async () => {
      const res = await msApiRequest('/membership/members?limit=1', { token: creator.token });

      expect(res.status).toBe(200);
      expect(res.data.data.length).toBeLessThanOrEqual(1);
    });
  });

  // ─── My Memberships ───

  describe('My memberships', () => {
    it('GET /membership/my should return memberships', async () => {
      // Creator self-subscribed, so they have memberships
      const res = await msApiRequest('/membership/my', { token: creator.token });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
      expect(res.data.length).toBeGreaterThanOrEqual(1);
      expect(res.data[0].creator).toBeDefined();
      expect(res.data[0].tier).toBeDefined();
    });

    it('GET /membership/my should return empty for user with no memberships', async () => {
      const res = await msApiRequest('/membership/my', { token: fan.token });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
    });
  });

  // ─── Cancel ───

  describe('Cancel membership', () => {
    it('POST /membership/:id/cancel should cancel membership', async () => {
      const res = await msApiRequest(`/membership/${membershipId}/cancel`, {
        method: 'POST',
        token: creator.token,
      });

      expect(res.status).toBe(204);
    });

    it('POST /membership/:id/cancel should reject already cancelled', async () => {
      const res = await msApiRequest(`/membership/${membershipId}/cancel`, {
        method: 'POST',
        token: creator.token,
      });

      expect(res.status).toBe(400);
    });

    it('POST /membership/:id/cancel should return 404 for non-existent', async () => {
      const res = await msApiRequest('/membership/00000000-0000-0000-0000-000000000000/cancel', {
        method: 'POST',
        token: creator.token,
      });

      expect(res.status).toBe(404);
    });
  });

  // ─── Stripe Connect ───

  describe('Stripe Connect', () => {
    it('GET /membership/connect/status should return connection status', async () => {
      const res = await msApiRequest('/membership/connect/status', { token: creator.token });

      expect(res.status).toBe(200);
      expect(res.data.connected).toBeDefined();
      expect(typeof res.data.connected).toBe('boolean');
    });
  });

  // ─── Tier Deletion ───

  describe('Tier deletion', () => {
    let emptyTierId: string;

    it('should create a tier to delete', async () => {
      const res = await msApiRequest('/membership/tiers', {
        method: 'POST',
        token: creator.token,
        body: { name: 'To Delete', priceMonthly: 10 },
      });
      expect(res.status).toBe(201);
      emptyTierId = res.data.id;
    });

    it('DELETE /membership/tiers/:id should delete empty tier', async () => {
      const res = await msApiRequest(`/membership/tiers/${emptyTierId}`, {
        method: 'DELETE',
        token: creator.token,
      });

      expect(res.status).toBe(204);
    });

    it('DELETE /membership/tiers/:id with members should fail', async () => {
      // createdTierId has a (cancelled) membership, but still has membership records
      const res = await msApiRequest(`/membership/tiers/${createdTierId}`, {
        method: 'DELETE',
        token: creator.token,
      });

      expect(res.status).toBe(400);
    });
  });
});
