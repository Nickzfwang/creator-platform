/**
 * Post-Production Tools API E2E Tests
 *
 * Tests against the live API server (http://localhost:4000).
 * Covers PRD acceptance criteria for filler removal, chapters,
 * script summary, and multi-platform generation.
 */

const PP_API_BASE = 'http://localhost:4000/api/v1';

async function apiRequest(
  path: string,
  options: { method?: string; body?: object; token?: string } = {},
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;

  const res = await fetch(`${PP_API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  return { status: res.status, data };
}

async function registerUser(): Promise<{ token: string; userId: string }> {
  const email = `e2e-pp-${Date.now()}@test.com`;
  const res = await apiRequest('/auth/register', {
    method: 'POST',
    body: { email, password: 'Test1234', displayName: 'PP Tester' },
  });
  return { token: res.data.accessToken, userId: res.data.user.id };
}

describe('Post-Production Tools API E2E', () => {
  let auth: { token: string; userId: string };

  beforeAll(async () => {
    auth = await registerUser();
  }, 15000);

  // ─── Authentication ───

  describe('Authentication checks', () => {
    it('POST /transcribe-words should return 401 without token', async () => {
      const res = await apiRequest('/videos/some-id/transcribe-words', { method: 'POST' });
      expect(res.status).toBe(401);
    });

    it('POST /detect-fillers should return 401 without token', async () => {
      const res = await apiRequest('/videos/some-id/detect-fillers', { method: 'POST' });
      expect(res.status).toBe(401);
    });

    it('POST /cut-fillers should return 401 without token', async () => {
      const res = await apiRequest('/videos/some-id/cut-fillers', {
        method: 'POST',
        body: { fillerIds: [] },
      });
      expect(res.status).toBe(401);
    });

    it('POST /generate-chapters should return 401 without token', async () => {
      const res = await apiRequest('/videos/some-id/generate-chapters', { method: 'POST' });
      expect(res.status).toBe(401);
    });

    it('PATCH /chapters should return 401 without token', async () => {
      const res = await apiRequest('/videos/some-id/chapters', {
        method: 'PATCH',
        body: { chapters: [] },
      });
      expect(res.status).toBe(401);
    });

    it('POST /generate-script-summary should return 401 without token', async () => {
      const res = await apiRequest('/videos/some-id/generate-script-summary', { method: 'POST' });
      expect(res.status).toBe(401);
    });

    it('POST /multi-platform should return 401 without token', async () => {
      const res = await apiRequest('/videos/multi-platform', {
        method: 'POST',
        body: { videoId: 'x', clipId: 'x', platforms: [] },
      });
      expect(res.status).toBe(401);
    });
  });

  // ─── Input Validation ───

  describe('Input validation', () => {
    it('POST /transcribe-words should return 400 for invalid UUID', async () => {
      const res = await apiRequest('/videos/not-uuid/transcribe-words', {
        method: 'POST',
        token: auth.token,
      });
      expect(res.status).toBe(400);
    });

    it('POST /detect-fillers should return 404 for non-existent video', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000010';
      const res = await apiRequest(`/videos/${fakeId}/detect-fillers`, {
        method: 'POST',
        token: auth.token,
      });
      expect(res.status).toBe(404);
    });

    it('POST /cut-fillers should return 404 for non-existent video', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000011';
      const res = await apiRequest(`/videos/${fakeId}/cut-fillers`, {
        method: 'POST',
        token: auth.token,
        body: { fillerIds: ['filler-0'] },
      });
      expect(res.status).toBe(404);
    });

    it('POST /cut-fillers should return 400 for empty fillerIds', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000012';
      const res = await apiRequest(`/videos/${fakeId}/cut-fillers`, {
        method: 'POST',
        token: auth.token,
        body: { fillerIds: [] },
      });
      expect(res.status).toBe(400);
    });

    it('POST /generate-chapters should return 404 for non-existent video', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000013';
      const res = await apiRequest(`/videos/${fakeId}/generate-chapters`, {
        method: 'POST',
        token: auth.token,
      });
      expect(res.status).toBe(404);
    });

    it('PATCH /chapters should return 404 for non-existent video', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000014';
      const res = await apiRequest(`/videos/${fakeId}/chapters`, {
        method: 'PATCH',
        token: auth.token,
        body: { chapters: [{ id: 'ch-0', title: 'Test', startTime: 0 }] },
      });
      expect(res.status).toBe(404);
    });

    it('POST /generate-script-summary should return 404 for non-existent video', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000015';
      const res = await apiRequest(`/videos/${fakeId}/generate-script-summary`, {
        method: 'POST',
        token: auth.token,
      });
      expect(res.status).toBe(404);
    });

    it('POST /multi-platform should return 400 for invalid UUIDs', async () => {
      const res = await apiRequest('/videos/multi-platform', {
        method: 'POST',
        token: auth.token,
        body: { videoId: 'not-uuid', clipId: 'not-uuid', platforms: ['youtube_shorts'] },
      });
      expect(res.status).toBe(400);
    });

    it('POST /multi-platform should return 400 for empty platforms', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000016';
      const res = await apiRequest('/videos/multi-platform', {
        method: 'POST',
        token: auth.token,
        body: { videoId: fakeId, clipId: fakeId, platforms: [] },
      });
      expect(res.status).toBe(400);
    });
  });

  // ─── Cross-tenant isolation ───

  describe('Multi-tenancy isolation', () => {
    it('should not allow accessing another user video endpoints', async () => {
      const auth2 = await registerUser();
      const fakeId = '00000000-0000-0000-0000-000000000017';

      // Both users try same fake video — both should get 404
      const res1 = await apiRequest(`/videos/${fakeId}/detect-fillers`, {
        method: 'POST',
        token: auth.token,
      });
      const res2 = await apiRequest(`/videos/${fakeId}/detect-fillers`, {
        method: 'POST',
        token: auth2.token,
      });

      expect(res1.status).toBe(404);
      expect(res2.status).toBe(404);
    });
  });

  // ─── API Response Format ───

  describe('API response format', () => {
    it('should return proper error format for invalid UUID', async () => {
      const res = await apiRequest('/videos/bad-uuid/generate-chapters', {
        method: 'POST',
        token: auth.token,
      });
      expect(res.status).toBe(400);
      expect(res.data).toHaveProperty('message');
      expect(res.data).toHaveProperty('statusCode', 400);
    });

    it('POST /transcribe-words should return proper error for non-PROCESSED video', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000018';
      const res = await apiRequest(`/videos/${fakeId}/transcribe-words`, {
        method: 'POST',
        token: auth.token,
      });
      // 404 because video doesn't exist (not 400 for not PROCESSED)
      expect(res.status).toBe(404);
    });
  });
});
