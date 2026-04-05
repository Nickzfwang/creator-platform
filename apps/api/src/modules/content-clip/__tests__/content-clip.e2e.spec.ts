const CC_API_BASE = 'http://localhost:4000/api/v1';

async function ccApiRequest(path: string, options: { method?: string; body?: object; token?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;
  const res = await fetch(`${CC_API_BASE}${path}`, {
    method: options.method ?? 'GET', headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : undefined };
}

async function ccRegister(): Promise<string> {
  const email = `e2e-cc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`;
  const res = await ccApiRequest('/auth/register', {
    method: 'POST', body: { email, password: 'Test1234', displayName: 'Clip Tester' },
  });
  return res.data.accessToken;
}

describe('Content Clip API E2E', () => {
  let token: string;
  let clipId: string;

  beforeAll(async () => { token = await ccRegister(); }, 15000);

  describe('Auth guards', () => {
    it('GET /clips → 401', async () => {
      expect((await ccApiRequest('/clips')).status).toBe(401);
    });
    it('POST /clips → 401', async () => {
      expect((await ccApiRequest('/clips', { method: 'POST', body: {} })).status).toBe(401);
    });
  });

  describe('Clip lifecycle', () => {
    it('POST /clips should create a clip', async () => {
      const res = await ccApiRequest('/clips', {
        method: 'POST', token,
        body: {
          platform: 'youtube',
          url: 'https://youtube.com/watch?v=e2e-test',
          title: 'E2E Test Clip',
          rawContent: '這是一段測試用的內容，用來測試 AI 摘要生成功能。',
          author: 'E2E Creator',
        },
      });

      expect(res.status).toBe(201);
      expect(res.data.platform).toBe('youtube');
      expect(res.data.title).toBe('E2E Test Clip');
      clipId = res.data.id;
    });

    it('GET /clips should list clips', async () => {
      const res = await ccApiRequest('/clips', { token });

      expect(res.status).toBe(200);
      expect(res.data.data).toBeDefined();
      expect(res.data.data.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /clips should filter by platform', async () => {
      const res = await ccApiRequest('/clips?platform=youtube', { token });
      expect(res.status).toBe(200);
    });

    it('PATCH /clips/:id/star should toggle star', async () => {
      const res = await ccApiRequest(`/clips/${clipId}/star`, {
        method: 'PATCH', token,
      });

      expect(res.status).toBe(200);
      expect(res.data.isStarred).toBe(true);
    });

    it('PATCH /clips/:id/star should toggle back', async () => {
      const res = await ccApiRequest(`/clips/${clipId}/star`, {
        method: 'PATCH', token,
      });

      expect(res.status).toBe(200);
      expect(res.data.isStarred).toBe(false);
    });

    it('GET /clips?starred=true should filter starred', async () => {
      const res = await ccApiRequest('/clips?starred=true', { token });
      expect(res.status).toBe(200);
    });

    it('DELETE /clips/:id should delete clip', async () => {
      const res = await ccApiRequest(`/clips/${clipId}`, {
        method: 'DELETE', token,
      });

      expect(res.status).toBe(204);
    });

    it('PATCH /clips/:id/star should 404 after deletion', async () => {
      const res = await ccApiRequest(`/clips/${clipId}/star`, {
        method: 'PATCH', token,
      });

      expect(res.status).toBe(404);
    });
  });
});
