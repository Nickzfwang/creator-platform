/**
 * API Gateway E2E Tests
 *
 * Tests against the live API server (http://localhost:4000).
 * Covers: API key CRUD, webhook CRUD, rate limits, auth guards.
 */

const GW_API_BASE = 'http://localhost:4000/api/v1';

async function gwApiRequest(
  path: string,
  options: { method?: string; body?: object; token?: string } = {},
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;

  const res = await fetch(`${GW_API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : undefined;
  return { status: res.status, data };
}

async function gwRegisterUser(): Promise<{ token: string; userId: string }> {
  const email = `e2e-gw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`;
  const res = await gwApiRequest('/auth/register', {
    method: 'POST',
    body: { email, password: 'Test1234', displayName: 'Gateway Tester' },
  });
  return { token: res.data.accessToken, userId: res.data.user.id };
}

describe('API Gateway E2E', () => {
  let auth: { token: string; userId: string };

  beforeAll(async () => {
    auth = await gwRegisterUser();
  }, 15000);

  // ─── Authentication Guards ───

  describe('Authentication checks', () => {
    it('GET /api-gateway/keys should return 401 without token', async () => {
      const res = await gwApiRequest('/api-gateway/keys');
      expect(res.status).toBe(401);
    });

    it('POST /api-gateway/keys should return 401 without token', async () => {
      const res = await gwApiRequest('/api-gateway/keys', { method: 'POST', body: { name: 'test' } });
      expect(res.status).toBe(401);
    });

    it('GET /api-gateway/webhooks should return 401 without token', async () => {
      const res = await gwApiRequest('/api-gateway/webhooks');
      expect(res.status).toBe(401);
    });

    it('GET /api-gateway/rate-limits should return 401 without token', async () => {
      const res = await gwApiRequest('/api-gateway/rate-limits');
      expect(res.status).toBe(401);
    });
  });

  // ─── API Key CRUD ───

  describe('API Key lifecycle', () => {
    let createdKeyId: string;

    it('POST /api-gateway/keys should create a new API key', async () => {
      const res = await gwApiRequest('/api-gateway/keys', {
        method: 'POST',
        token: auth.token,
        body: { name: 'E2E Test Key' },
      });

      expect(res.status).toBe(201);
      expect(res.data.key).toMatch(/^cpk_/);
      expect(res.data.name).toBe('E2E Test Key');
      expect(res.data.scopes).toEqual(['read', 'write']);
      createdKeyId = res.data.id;
    });

    it('POST /api-gateway/keys should accept custom scopes', async () => {
      const res = await gwApiRequest('/api-gateway/keys', {
        method: 'POST',
        token: auth.token,
        body: { name: 'Read Only Key', scopes: ['read'] },
      });

      expect(res.status).toBe(201);
      expect(res.data.scopes).toEqual(['read']);
    });

    it('GET /api-gateway/keys should list keys without raw key', async () => {
      const res = await gwApiRequest('/api-gateway/keys', { token: auth.token });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
      expect(res.data.length).toBeGreaterThanOrEqual(1);

      // Should NOT contain raw key
      for (const key of res.data) {
        expect(key).not.toHaveProperty('key');
        expect(key).not.toHaveProperty('keyHash');
        expect(key.keyPrefix).toMatch(/^cpk_/);
      }
    });

    it('DELETE /api-gateway/keys/:id should revoke key', async () => {
      const res = await gwApiRequest(`/api-gateway/keys/${createdKeyId}`, {
        method: 'DELETE',
        token: auth.token,
      });

      expect(res.status).toBe(204);
    });

    it('DELETE /api-gateway/keys/:id should 404 for non-existent key', async () => {
      const res = await gwApiRequest('/api-gateway/keys/nonexistent-id', {
        method: 'DELETE',
        token: auth.token,
      });

      expect(res.status).toBe(404);
    });
  });

  // ─── Webhook CRUD ───

  describe('Webhook lifecycle', () => {
    let createdWebhookId: string;

    it('GET /api-gateway/webhooks/events should list available events', async () => {
      const res = await gwApiRequest('/api-gateway/webhooks/events', { token: auth.token });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
      expect(res.data).toContain('video.uploaded');
      expect(res.data).toContain('post.published');
    });

    it('POST /api-gateway/webhooks should create a webhook', async () => {
      const res = await gwApiRequest('/api-gateway/webhooks', {
        method: 'POST',
        token: auth.token,
        body: {
          url: 'https://example.com/e2e-webhook',
          events: ['video.uploaded', 'post.published'],
          description: 'E2E test webhook',
        },
      });

      expect(res.status).toBe(201);
      expect(res.data.secret).toMatch(/^whsec_/);
      expect(res.data.url).toBe('https://example.com/e2e-webhook');
      expect(res.data.events).toEqual(['video.uploaded', 'post.published']);
      createdWebhookId = res.data.id;
    });

    it('POST /api-gateway/webhooks should reject invalid events', async () => {
      const res = await gwApiRequest('/api-gateway/webhooks', {
        method: 'POST',
        token: auth.token,
        body: {
          url: 'https://example.com/hook',
          events: ['invalid.event'],
        },
      });

      expect(res.status).toBe(400);
    });

    it('GET /api-gateway/webhooks should list webhooks without secret', async () => {
      const res = await gwApiRequest('/api-gateway/webhooks', { token: auth.token });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
      expect(res.data.length).toBeGreaterThanOrEqual(1);

      for (const wh of res.data) {
        expect(wh).not.toHaveProperty('secret');
      }
    });

    it('DELETE /api-gateway/webhooks/:id should disable webhook', async () => {
      const res = await gwApiRequest(`/api-gateway/webhooks/${createdWebhookId}`, {
        method: 'DELETE',
        token: auth.token,
      });

      expect(res.status).toBe(204);
    });

    it('DELETE /api-gateway/webhooks/:id should 404 for non-existent webhook', async () => {
      const res = await gwApiRequest('/api-gateway/webhooks/nonexistent-id', {
        method: 'DELETE',
        token: auth.token,
      });

      expect(res.status).toBe(404);
    });
  });

  // ─── Rate Limits ───

  describe('Rate Limits', () => {
    it('GET /api-gateway/rate-limits should return plan-based limits', async () => {
      const res = await gwApiRequest('/api-gateway/rate-limits', { token: auth.token });

      expect(res.status).toBe(200);
      expect(res.data.plan).toBeDefined();
      expect(res.data.limits).toBeDefined();
      expect(res.data.limits.requestsPerMinute).toBeGreaterThan(0);
      expect(res.data.limits.requestsPerDay).toBeGreaterThan(0);
    });
  });
});
