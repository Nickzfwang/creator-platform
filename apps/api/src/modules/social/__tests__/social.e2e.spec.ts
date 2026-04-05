/**
 * Social API E2E Tests
 *
 * Tests against the live API server (http://localhost:4000).
 * Covers: account listing, OAuth redirect, sync endpoints, auth guards.
 */

const SOCIAL_API_BASE = 'http://localhost:4000/api/v1';

async function socialApiRequest(
  path: string,
  options: { method?: string; body?: object; token?: string; redirect?: 'manual' | 'follow' } = {},
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;

  const res = await fetch(`${SOCIAL_API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    redirect: options.redirect ?? 'manual',
  });

  if (options.redirect === 'follow' || !options.redirect) {
    // For redirect=manual, don't try to parse body on 3xx
    if (res.status >= 300 && res.status < 400) {
      return { status: res.status, data: undefined, location: res.headers.get('location') };
    }
  }

  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : undefined;
  return { status: res.status, data, location: res.headers.get('location') };
}

async function socialRegisterUser(): Promise<{ token: string; userId: string }> {
  const email = `e2e-social-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`;
  const res = await socialApiRequest('/auth/register', {
    method: 'POST',
    body: { email, password: 'Test1234', displayName: 'Social Tester' },
    redirect: 'follow',
  });
  return { token: res.data.accessToken, userId: res.data.user.id };
}

describe('Social API E2E', () => {
  let auth: { token: string; userId: string };

  beforeAll(async () => {
    auth = await socialRegisterUser();
  }, 15000);

  // ─── Authentication Guards ───

  describe('Authentication checks', () => {
    it('GET /social/accounts should return 401 without token', async () => {
      const res = await socialApiRequest('/social/accounts');
      expect(res.status).toBe(401);
    });

    it('POST /social/sync should return 401 without token', async () => {
      const res = await socialApiRequest('/social/sync', { method: 'POST' });
      expect(res.status).toBe(401);
    });

    it('GET /social/sync/status should return 401 without token', async () => {
      const res = await socialApiRequest('/social/sync/status');
      expect(res.status).toBe(401);
    });

    it('DELETE /social/accounts/:id should return 401 without token', async () => {
      const res = await socialApiRequest('/social/accounts/00000000-0000-0000-0000-000000000000', {
        method: 'DELETE',
      });
      expect(res.status).toBe(401);
    });

    it('POST /social/accounts/:id/refresh should return 401 without token', async () => {
      const res = await socialApiRequest('/social/accounts/00000000-0000-0000-0000-000000000000/refresh', {
        method: 'POST',
      });
      expect(res.status).toBe(401);
    });
  });

  // ─── Account Listing ───

  describe('GET /social/accounts', () => {
    it('should return empty list for new user', async () => {
      const res = await socialApiRequest('/social/accounts', { token: auth.token });
      expect(res.status).toBe(200);
      expect(res.data.data).toEqual([]);
    });
  });

  // ─── OAuth Connect (redirect check) ───

  describe('GET /social/connect/:platform', () => {
    it('should redirect to YouTube OAuth URL', async () => {
      const res = await socialApiRequest('/social/connect/youtube', {
        token: auth.token,
        redirect: 'manual',
      });
      // Should get a 302 redirect
      expect([301, 302]).toContain(res.status);
      expect(res.location).toContain('accounts.google.com');
    });

    it('should redirect to Twitter OAuth URL with PKCE', async () => {
      const res = await socialApiRequest('/social/connect/twitter', {
        token: auth.token,
        redirect: 'manual',
      });
      expect([301, 302]).toContain(res.status);
      expect(res.location).toContain('twitter.com');
      expect(res.location).toContain('code_challenge');
    });

    it('should redirect to TikTok OAuth URL', async () => {
      const res = await socialApiRequest('/social/connect/tiktok', {
        token: auth.token,
        redirect: 'manual',
      });
      expect([301, 302]).toContain(res.status);
      expect(res.location).toContain('tiktok.com');
    });

    it('should return 400 for unsupported platform', async () => {
      const res = await socialApiRequest('/social/connect/linkedin', {
        token: auth.token,
        redirect: 'follow',
      });
      expect(res.status).toBe(400);
    });
  });

  // ─── OAuth Callback ───

  describe('GET /social/callback/:platform', () => {
    it('should redirect to frontend with error on missing params', async () => {
      const res = await socialApiRequest('/social/callback/youtube', { redirect: 'manual' });
      expect([301, 302]).toContain(res.status);
      expect(res.location).toContain('error=missing_params');
    });

    it('should redirect to frontend with error when OAuth error param present', async () => {
      const res = await socialApiRequest('/social/callback/youtube?error=access_denied', {
        redirect: 'manual',
      });
      expect([301, 302]).toContain(res.status);
      expect(res.location).toContain('error=access_denied');
    });

    it('should redirect with error on invalid state', async () => {
      const res = await socialApiRequest(
        '/social/callback/youtube?code=test-code&state=invalid-state',
        { redirect: 'manual' },
      );
      expect([301, 302]).toContain(res.status);
      expect(res.location).toMatch(/error=(invalid_state|server_error)/);
    });
  });

  // ─── Sync ───

  describe('POST /social/sync', () => {
    it('should return sync results (empty for new user)', async () => {
      const res = await socialApiRequest('/social/sync', {
        method: 'POST',
        token: auth.token,
      });
      expect(res.status).toBe(201);
      expect(res.data.syncedAt).toBeDefined();
      expect(res.data.results).toEqual([]);
    });
  });

  describe('GET /social/sync/status', () => {
    it('should return empty status for new user', async () => {
      const res = await socialApiRequest('/social/sync/status', { token: auth.token });
      expect(res.status).toBe(200);
      expect(res.data).toEqual([]);
    });
  });

  // ─── Disconnect / Refresh (non-existent account) ───

  describe('DELETE /social/accounts/:id', () => {
    it('should return 404 for non-existent account', async () => {
      const res = await socialApiRequest(
        '/social/accounts/00000000-0000-0000-0000-000000000001',
        { method: 'DELETE', token: auth.token },
      );
      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid UUID', async () => {
      const res = await socialApiRequest('/social/accounts/not-a-uuid', {
        method: 'DELETE',
        token: auth.token,
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /social/accounts/:id/refresh', () => {
    it('should return 404 for non-existent account', async () => {
      const res = await socialApiRequest(
        '/social/accounts/00000000-0000-0000-0000-000000000001/refresh',
        { method: 'POST', token: auth.token },
      );
      expect(res.status).toBe(404);
    });
  });

  // ─── Platform validation ───

  describe('Platform validation', () => {
    it('should be case-insensitive for platform names', async () => {
      const res = await socialApiRequest('/social/connect/YOUTUBE', {
        token: auth.token,
        redirect: 'manual',
      });
      expect([301, 302]).toContain(res.status);
    });
  });
});
