const LP_API_BASE = 'http://localhost:4000/api/v1';

async function lpApiRequest(path: string, options: { method?: string; body?: object; token?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;
  const res = await fetch(`${LP_API_BASE}${path}`, {
    method: options.method ?? 'GET', headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : undefined };
}

async function lpRegister(): Promise<string> {
  const email = `e2e-lp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`;
  const res = await lpApiRequest('/auth/register', {
    method: 'POST', body: { email, password: 'Test1234', displayName: 'LP Tester' },
  });
  return res.data.accessToken;
}

describe('Landing Page API E2E', () => {
  let token: string;
  let pageId: string;
  let pageSlug: string;

  beforeAll(async () => { token = await lpRegister(); }, 15000);

  describe('Auth guards', () => {
    it('GET /landing-page/mine → 401', async () => {
      expect((await lpApiRequest('/landing-page/mine')).status).toBe(401);
    });
    it('POST /landing-page/ai-generate → 401', async () => {
      expect((await lpApiRequest('/landing-page/ai-generate', { method: 'POST', body: {} })).status).toBe(401);
    });
  });

  describe('AI Generate', () => {
    it('POST /landing-page/ai-generate should create a page', async () => {
      const res = await lpApiRequest('/landing-page/ai-generate', {
        method: 'POST', token,
        body: { creatorName: 'E2E Creator', niche: '科技', description: 'Test' },
      });

      expect(res.status).toBe(201);
      expect(res.data.slug).toBeDefined();
      expect(res.data.isPublished).toBe(false);
      pageId = res.data.id;
      pageSlug = res.data.slug;
    }, 30000);
  });

  describe('GET /landing-page/mine', () => {
    it('should return user page', async () => {
      const res = await lpApiRequest('/landing-page/mine', { token });
      expect(res.status).toBe(200);
      expect(res.data.id).toBe(pageId);
    });
  });

  describe('PATCH /landing-page/:id', () => {
    it('should update page fields', async () => {
      const res = await lpApiRequest(`/landing-page/${pageId}`, {
        method: 'PATCH', token,
        body: { headline: 'Updated Headline', isPublished: true },
      });
      expect(res.status).toBe(200);
      expect(res.data.headline).toBe('Updated Headline');
      expect(res.data.isPublished).toBe(true);
    });

    it('should return 404 for non-existent page', async () => {
      const res = await lpApiRequest('/landing-page/00000000-0000-0000-0000-000000000000', {
        method: 'PATCH', token, body: { headline: 'x' },
      });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /landing-page/p/:slug (public)', () => {
    it('should return published page without auth', async () => {
      const res = await lpApiRequest(`/landing-page/p/${pageSlug}`);
      expect(res.status).toBe(200);
      expect(res.data.slug).toBe(pageSlug);
    });

    it('should return 404 for non-existent slug', async () => {
      const res = await lpApiRequest('/landing-page/p/nonexistent-slug-xyz');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /landing-page/:id/ai-section', () => {
    it('should regenerate a section', async () => {
      const res = await lpApiRequest(`/landing-page/${pageId}/ai-section`, {
        method: 'POST', token,
        body: { sectionType: 'faq' },
      });
      // AI may or may not be available, just check it doesn't crash
      expect([200, 201]).toContain(res.status);
    });
  });

  describe('DELETE /landing-page/:id', () => {
    it('should delete the page', async () => {
      const res = await lpApiRequest(`/landing-page/${pageId}`, {
        method: 'DELETE', token,
      });
      expect(res.status).toBe(204);
    });

    it('should return 404 or error after deletion', async () => {
      const res = await lpApiRequest(`/landing-page/${pageId}`, {
        method: 'PATCH', token, body: { headline: 'x' },
      });
      // Page no longer exists — could be 404 (not found) or 400 (Prisma record not found)
      expect([400, 404]).toContain(res.status);
    });
  });
});
