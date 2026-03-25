/**
 * Monetize API E2E Tests
 *
 * Tests against the live API server (http://localhost:4000).
 */

const MZ_API_BASE = 'http://localhost:4000/api/v1';

async function mzApiRequest(
  path: string,
  options: { method?: string; body?: object; token?: string } = {},
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;

  const res = await fetch(`${MZ_API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  return { status: res.status, data };
}

async function mzRegisterUser(): Promise<{ token: string; userId: string }> {
  const email = `e2e-mz-${Date.now()}@test.com`;
  const res = await mzApiRequest('/auth/register', {
    method: 'POST',
    body: { email, password: 'Test1234', displayName: 'Monetize Tester' },
  });
  return { token: res.data.accessToken, userId: res.data.user.id };
}

describe('Monetize API E2E', () => {
  let auth: { token: string; userId: string };

  beforeAll(async () => {
    auth = await mzRegisterUser();
  }, 15000);

  // ─── Authentication ───

  describe('Authentication checks', () => {
    it('GET /health should return 401 without token', async () => {
      const res = await mzApiRequest('/monetize/health');
      expect(res.status).toBe(401);
    });

    it('GET /advice should return 401 without token', async () => {
      const res = await mzApiRequest('/monetize/advice');
      expect(res.status).toBe(401);
    });

    it('GET /forecast should return 401 without token', async () => {
      const res = await mzApiRequest('/monetize/forecast');
      expect(res.status).toBe(401);
    });
  });

  // ─── Health ───

  describe('Revenue Health', () => {
    it('GET /health should return health report for new user', async () => {
      const res = await mzApiRequest('/monetize/health', { token: auth.token });
      expect(res.status).toBe(200);
      expect(res.data.totalRevenue).toBeDefined();
      expect(res.data.channels).toBeDefined();
      expect(res.data.channels.membership).toBeDefined();
      expect(res.data.channels.digitalProduct).toBeDefined();
      expect(res.data.channels.brandDeal).toBeDefined();
      expect(res.data.channels.affiliate).toBeDefined();
      expect(res.data.period).toBeDefined();
    });

    it('GET /health?period=90d should accept period param', async () => {
      const res = await mzApiRequest('/monetize/health?period=90d', { token: auth.token });
      expect(res.status).toBe(200);
      expect(res.data.totalRevenue).toBeDefined();
    });

    it('should have zero revenue for new user', async () => {
      const res = await mzApiRequest('/monetize/health', { token: auth.token });
      expect(res.data.totalRevenue).toBe(0);
      expect(res.data.channels.membership.revenue).toBe(0);
      expect(res.data.channels.membership.activeMembers).toBe(0);
    });

    it('should include all channel KPIs', async () => {
      const res = await mzApiRequest('/monetize/health', { token: auth.token });
      const { channels } = res.data;

      // Membership KPIs
      expect(channels.membership).toHaveProperty('mrr');
      expect(channels.membership).toHaveProperty('activeMembers');
      expect(channels.membership).toHaveProperty('churnRate');

      // Product KPIs
      expect(channels.digitalProduct).toHaveProperty('totalSales');
      expect(channels.digitalProduct).toHaveProperty('avgOrderValue');

      // Brand deal KPIs
      expect(channels.brandDeal).toHaveProperty('activeDeals');
      expect(channels.brandDeal).toHaveProperty('conversionRate');

      // Affiliate KPIs
      expect(channels.affiliate).toHaveProperty('totalClicks');
      expect(channels.affiliate).toHaveProperty('conversionRate');
    });
  });

  // ─── Advice ───

  describe('AI Advice', () => {
    it('GET /advice should return advice report', async () => {
      const res = await mzApiRequest('/monetize/advice', { token: auth.token });
      expect(res.status).toBe(200);
      expect(res.data.suggestions).toBeDefined();
      expect(Array.isArray(res.data.suggestions)).toBe(true);
      expect(res.data.generatedAt).toBeDefined();
    }, 30000);

    it('should include pricing advice structure', async () => {
      const res = await mzApiRequest('/monetize/advice', { token: auth.token });
      expect(res.data.pricingAdvice).toBeDefined();
    }, 30000);

    it('should include unused channels for new user', async () => {
      const res = await mzApiRequest('/monetize/advice', { token: auth.token });
      expect(res.data.unusedChannels).toBeDefined();
      expect(Array.isArray(res.data.unusedChannels)).toBe(true);
    }, 30000);
  });

  // ─── Forecast ───

  describe('Revenue Forecast', () => {
    it('GET /forecast should return forecast or insufficient data', async () => {
      const res = await mzApiRequest('/monetize/forecast', { token: auth.token });
      expect(res.status).toBe(200);
      expect(typeof res.data.hasEnoughData).toBe('boolean');
      expect(res.data.assumptions).toBeDefined();
      expect(res.data.generatedAt).toBeDefined();
    });

    it('should return hasEnoughData=false for new user', async () => {
      const res = await mzApiRequest('/monetize/forecast', { token: auth.token });
      expect(res.data.hasEnoughData).toBe(false);
      expect(res.data.forecast).toBeNull();
    });
  });

  // ─── Multi-tenant ───

  describe('Multi-tenant isolation', () => {
    it('different users should get independent health reports', async () => {
      const auth2 = await mzRegisterUser();

      const res1 = await mzApiRequest('/monetize/health', { token: auth.token });
      const res2 = await mzApiRequest('/monetize/health', { token: auth2.token });

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      // Both new users, both should have zero
      expect(res1.data.totalRevenue).toBe(0);
      expect(res2.data.totalRevenue).toBe(0);
    });
  });
});
