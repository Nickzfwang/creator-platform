const AN_API_BASE = 'http://localhost:4000/api/v1';

async function anApiRequest(path: string, options: { token?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;
  const res = await fetch(`${AN_API_BASE}${path}`, { headers });
  const text = await res.text();
  return { status: res.status, data: text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : undefined };
}

async function anRegister(): Promise<string> {
  const email = `e2e-an-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`;
  const res = await fetch(`${AN_API_BASE}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Test1234', displayName: 'Analytics Tester' }),
  });
  const data = await res.json();
  return data.accessToken;
}

describe('Analytics API E2E', () => {
  let token: string;

  beforeAll(async () => { token = await anRegister(); }, 15000);

  describe('Auth guards', () => {
    it('GET /analytics/overview → 401', async () => { expect((await anApiRequest('/analytics/overview')).status).toBe(401); });
    it('GET /analytics/platform → 401', async () => { expect((await anApiRequest('/analytics/platform')).status).toBe(401); });
    it('GET /analytics/comparison → 401', async () => { expect((await anApiRequest('/analytics/comparison')).status).toBe(401); });
    it('GET /analytics/revenue → 401', async () => { expect((await anApiRequest('/analytics/revenue')).status).toBe(401); });
    it('GET /analytics/top-content → 401', async () => { expect((await anApiRequest('/analytics/top-content')).status).toBe(401); });
  });

  describe('GET /analytics/overview', () => {
    it('should return overview with metrics and changes', async () => {
      const res = await anApiRequest('/analytics/overview', { token });
      expect(res.status).toBe(200);
      expect(res.data.metrics).toBeDefined();
      expect(res.data.changes).toBeDefined();
      expect(res.data.period).toBeDefined();
    });

    it('should accept period query param', async () => {
      const res = await anApiRequest('/analytics/overview?period=7d', { token });
      expect(res.status).toBe(200);
    });
  });

  describe('GET /analytics/platform', () => {
    it('should return platform stats', async () => {
      const res = await anApiRequest('/analytics/platform', { token });
      expect(res.status).toBe(200);
      expect(res.data.dailyTrends).toBeDefined();
      expect(res.data.totals).toBeDefined();
    });
  });

  describe('GET /analytics/comparison', () => {
    it('should return cross-platform comparison', async () => {
      const res = await anApiRequest('/analytics/comparison', { token });
      expect(res.status).toBe(200);
      expect(res.data.platforms).toBeDefined();
    });
  });

  describe('GET /analytics/revenue', () => {
    it('should return revenue analytics', async () => {
      const res = await anApiRequest('/analytics/revenue', { token });
      expect(res.status).toBe(200);
      expect(res.data.total).toBeDefined();
      expect(typeof res.data.total).toBe('number');
    });

    it('should filter by source', async () => {
      const res = await anApiRequest('/analytics/revenue?source=affiliate', { token });
      expect(res.status).toBe(200);
      expect(res.data.source).toBe('affiliate');
    });
  });

  describe('GET /analytics/top-content', () => {
    it('should return top content list', async () => {
      const res = await anApiRequest('/analytics/top-content', { token });
      expect(res.status).toBe(200);
      expect(res.data.content).toBeDefined();
      expect(Array.isArray(res.data.content)).toBe(true);
    });
  });
});
