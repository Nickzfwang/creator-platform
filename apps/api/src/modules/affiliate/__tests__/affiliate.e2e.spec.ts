const AF_API_BASE = 'http://localhost:4000/api/v1';

async function afApiRequest(path: string, options: { method?: string; body?: object; token?: string; redirect?: 'manual' | 'follow' } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;
  const res = await fetch(`${AF_API_BASE}${path}`, {
    method: options.method ?? 'GET', headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    redirect: options.redirect ?? 'follow',
  });
  const text = await res.text();
  return {
    status: res.status, location: res.headers.get('location'),
    data: text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : undefined,
  };
}

async function afRegister(): Promise<string> {
  const email = `e2e-af-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`;
  const res = await afApiRequest('/auth/register', {
    method: 'POST', body: { email, password: 'Test1234', displayName: 'Affiliate Tester' },
  });
  return res.data.accessToken;
}

describe('Affiliate API E2E', () => {
  let token: string;
  let linkId: string;
  let trackingCode: string;

  beforeAll(async () => { token = await afRegister(); }, 15000);

  describe('Auth guards', () => {
    it('GET /affiliate/links → 401', async () => { expect((await afApiRequest('/affiliate/links')).status).toBe(401); });
    it('POST /affiliate/links → 401', async () => {
      expect((await afApiRequest('/affiliate/links', { method: 'POST', body: { originalUrl: 'https://x.com' } })).status).toBe(401);
    });
    it('GET /affiliate/stats → 401', async () => { expect((await afApiRequest('/affiliate/stats')).status).toBe(401); });
  });

  describe('Link lifecycle', () => {
    it('POST /affiliate/links should create a link', async () => {
      const res = await afApiRequest('/affiliate/links', {
        method: 'POST', token,
        body: { originalUrl: 'https://example.com/product', productName: 'E2E Product', commissionRate: 0.15 },
      });

      expect(res.status).toBe(201);
      expect(res.data.trackingCode).toBeDefined();
      expect(res.data.shortUrl).toContain('/r/');
      expect(res.data.commissionRate).toBe(0.15);
      linkId = res.data.id;
      trackingCode = res.data.trackingCode;
    });

    it('GET /affiliate/links should list links', async () => {
      const res = await afApiRequest('/affiliate/links', { token });
      expect(res.status).toBe(200);
      expect(res.data.data.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /affiliate/links/:id should return link detail', async () => {
      const res = await afApiRequest(`/affiliate/links/${linkId}`, { token });
      expect(res.status).toBe(200);
      expect(res.data.totalEvents).toBeDefined();
      expect(res.data.recentEventsSummary).toBeDefined();
    });

    it('PATCH /affiliate/links/:id should update', async () => {
      const res = await afApiRequest(`/affiliate/links/${linkId}`, {
        method: 'PATCH', token,
        body: { productName: 'Updated Product' },
      });
      expect(res.status).toBe(200);
      expect(res.data.productName).toBe('Updated Product');
    });
  });

  describe('Events (auth required — class-level guard)', () => {
    it('POST /affiliate/events should create PURCHASE event', async () => {
      const res = await afApiRequest('/affiliate/events', {
        method: 'POST', token,
        body: { trackingCode, eventType: 'PURCHASE', revenueAmount: 99.99 },
      });
      expect(res.status).toBe(201);
      expect(res.data.eventType).toBe('PURCHASE');
    });

    it('POST /affiliate/events should reject CLICK events', async () => {
      const res = await afApiRequest('/affiliate/events', {
        method: 'POST', token,
        body: { trackingCode, eventType: 'CLICK' },
      });
      expect(res.status).toBe(400);
    });

    it('POST /affiliate/events should 404 for unknown tracking code', async () => {
      const res = await afApiRequest('/affiliate/events', {
        method: 'POST', token,
        body: { trackingCode: 'nonexistent', eventType: 'PURCHASE' },
      });
      expect(res.status).toBe(404);
    });
  });

  describe('Redirect (public, /api/r/ with global prefix)', () => {
    it('GET /api/r/:trackingCode should redirect', async () => {
      const res = await fetch(`http://localhost:4000/api/r/${trackingCode}`, { redirect: 'manual' });
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('https://example.com/product');
    });

    it('GET /api/r/:unknown should 404', async () => {
      const res = await fetch('http://localhost:4000/api/r/nonexistent', { redirect: 'manual' });
      expect(res.status).toBe(404);
    });
  });

  describe('Stats', () => {
    it('GET /affiliate/stats should return stats', async () => {
      const res = await afApiRequest('/affiliate/stats', { token });
      expect(res.status).toBe(200);
      expect(res.data.totalClicks).toBeDefined();
      expect(res.data.totalConversions).toBeDefined();
      expect(res.data.totalRevenue).toBeDefined();
    });

    it('should accept period query', async () => {
      const res = await afApiRequest('/affiliate/stats?period=7d', { token });
      expect(res.status).toBe(200);
    });
  });

  describe('Deactivate', () => {
    it('DELETE /affiliate/links/:id should deactivate', async () => {
      const res = await afApiRequest(`/affiliate/links/${linkId}`, { method: 'DELETE', token });
      expect(res.status).toBe(204);
    });
  });
});
