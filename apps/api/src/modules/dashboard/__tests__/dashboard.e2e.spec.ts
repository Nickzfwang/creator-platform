const DB_API_BASE = 'http://localhost:4000/api/v1';

async function dbApiRequest(path: string, options: { token?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;
  const res = await fetch(`${DB_API_BASE}${path}`, { headers });
  const text = await res.text();
  return { status: res.status, data: text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : undefined };
}

async function dbRegister(): Promise<string> {
  const email = `e2e-db-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`;
  const res = await fetch(`${DB_API_BASE}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Test1234', displayName: 'Dashboard Tester' }),
  });
  const data = await res.json();
  return data.accessToken;
}

describe('Dashboard API E2E', () => {
  let token: string;

  beforeAll(async () => { token = await dbRegister(); }, 15000);

  describe('Auth guards', () => {
    it('GET /dashboard/overview → 401', async () => {
      expect((await dbApiRequest('/dashboard/overview')).status).toBe(401);
    });
    it('GET /dashboard/recent-posts → 401', async () => {
      expect((await dbApiRequest('/dashboard/recent-posts')).status).toBe(401);
    });
    it('GET /dashboard/quick-stats → 401', async () => {
      expect((await dbApiRequest('/dashboard/quick-stats')).status).toBe(401);
    });
  });

  describe('GET /dashboard/overview', () => {
    it('should return overview data', async () => {
      const res = await dbApiRequest('/dashboard/overview', { token });
      expect(res.status).toBe(200);
      expect(res.data.metrics).toBeDefined();
      expect(res.data.trends).toBeDefined();
      expect(res.data.platformBreakdown).toBeDefined();
    });

    it('should accept period param', async () => {
      const res = await dbApiRequest('/dashboard/overview?period=7d', { token });
      expect(res.status).toBe(200);
    });
  });

  describe('GET /dashboard/recent-posts', () => {
    it('should return posts array', async () => {
      const res = await dbApiRequest('/dashboard/recent-posts', { token });
      expect(res.status).toBe(200);
      expect(res.data.posts).toBeDefined();
      expect(Array.isArray(res.data.posts)).toBe(true);
    });

    it('should accept limit param', async () => {
      const res = await dbApiRequest('/dashboard/recent-posts?limit=3', { token });
      expect(res.status).toBe(200);
    });
  });

  describe('GET /dashboard/quick-stats', () => {
    it('should return today stats and subscription', async () => {
      const res = await dbApiRequest('/dashboard/quick-stats', { token });
      expect(res.status).toBe(200);
      expect(res.data.today).toBeDefined();
      expect(res.data.subscription).toBeDefined();
      expect(res.data.connectedPlatforms).toBeDefined();
      expect(typeof res.data.today.views).toBe('number');
    });
  });
});
