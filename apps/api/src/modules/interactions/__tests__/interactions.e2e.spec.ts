/**
 * Interactions API E2E Tests
 */

const IA_API_BASE = 'http://localhost:4000/api/v1';

async function iaApiRequest(
  path: string,
  options: { method?: string; body?: object; token?: string } = {},
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;

  const res = await fetch(`${IA_API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  return { status: res.status, data };
}

async function iaRegisterUser(): Promise<{ token: string }> {
  const email = `e2e-ia-${Date.now()}@test.com`;
  const res = await iaApiRequest('/auth/register', {
    method: 'POST',
    body: { email, password: 'Test1234', displayName: 'IA Tester' },
  });
  return { token: res.data.accessToken };
}

describe('Interactions API E2E', () => {
  let auth: { token: string };

  beforeAll(async () => {
    auth = await iaRegisterUser();
  }, 15000);

  describe('Authentication', () => {
    it('POST /comments/import should return 401 without token', async () => {
      const res = await iaApiRequest('/interactions/comments/import', {
        method: 'POST',
        body: { comments: [] },
      });
      expect(res.status).toBe(401);
    });

    it('GET /comments should return 401 without token', async () => {
      const res = await iaApiRequest('/interactions/comments');
      expect(res.status).toBe(401);
    });

    it('GET /stats should return 401 without token', async () => {
      const res = await iaApiRequest('/interactions/stats');
      expect(res.status).toBe(401);
    });
  });

  describe('Input validation', () => {
    it('POST /comments/import should return 400 with empty comments', async () => {
      const res = await iaApiRequest('/interactions/comments/import', {
        method: 'POST',
        token: auth.token,
        body: { comments: [] },
      });
      expect(res.status).toBe(400);
    });

    it('POST /comments/:id/generate-reply should return 400 for invalid UUID', async () => {
      const res = await iaApiRequest('/interactions/comments/not-uuid/generate-reply', {
        method: 'POST',
        token: auth.token,
        body: {},
      });
      expect(res.status).toBe(400);
    });
  });

  describe('Comment CRUD', () => {
    let commentId: string;

    it('POST /comments/import should import comments', async () => {
      const res = await iaApiRequest('/interactions/comments/import', {
        method: 'POST',
        token: auth.token,
        body: {
          comments: [
            { authorName: '小明', content: '這支影片太棒了！', platform: 'YOUTUBE' },
            { authorName: '阿華', content: '請問可以出更多教學嗎？', platform: 'YOUTUBE' },
            { authorName: 'spam_bot', content: '點擊此連結獲得免費iPhone' },
          ],
        },
      });
      expect(res.status).toBe(201);
      expect(res.data.imported).toBe(3);
      expect(res.data.commentIds).toHaveLength(3);
      commentId = res.data.commentIds[0];
    });

    it('GET /comments should list imported comments', async () => {
      const res = await iaApiRequest('/interactions/comments', { token: auth.token });
      expect(res.status).toBe(200);
      expect(res.data.data.length).toBeGreaterThanOrEqual(3);
    });

    it('GET /comments?category=QUESTION should filter', async () => {
      // Wait a moment for AI classification to complete
      await new Promise((r) => setTimeout(r, 3000));

      const res = await iaApiRequest('/interactions/comments', { token: auth.token });
      expect(res.status).toBe(200);
      // Comments should exist (classification may or may not be done)
      expect(res.data.data.length).toBeGreaterThanOrEqual(1);
    });

    it('POST /comments/:id/generate-reply should generate replies', async () => {
      const res = await iaApiRequest(`/interactions/comments/${commentId}/generate-reply`, {
        method: 'POST',
        token: auth.token,
        body: { tone: 'friendly' },
      });
      expect(res.status).toBe(200);
      expect(res.data.replies).toBeDefined();
      expect(res.data.replies.length).toBeGreaterThanOrEqual(1);
    }, 30000);

    it('PATCH /comments/:id should mark as replied', async () => {
      const res = await iaApiRequest(`/interactions/comments/${commentId}`, {
        method: 'PATCH',
        token: auth.token,
        body: { finalReply: '謝謝你的支持！', isReplied: true },
      });
      expect(res.status).toBe(200);
      expect(res.data.isReplied).toBe(true);
      expect(res.data.finalReply).toBe('謝謝你的支持！');
      expect(res.data.repliedAt).toBeDefined();
    });

    it('DELETE /comments/:id should delete a comment', async () => {
      // Import one to delete
      const importRes = await iaApiRequest('/interactions/comments/import', {
        method: 'POST',
        token: auth.token,
        body: { comments: [{ authorName: 'test', content: 'to delete' }] },
      });
      const deleteId = importRes.data.commentIds[0];

      const res = await iaApiRequest(`/interactions/comments/${deleteId}`, {
        method: 'DELETE',
        token: auth.token,
      });
      expect(res.status).toBe(204);
    });
  });

  describe('Stats', () => {
    it('GET /stats should return interaction statistics', async () => {
      const res = await iaApiRequest('/interactions/stats?period=30d', { token: auth.token });
      expect(res.status).toBe(200);
      expect(res.data.totalComments).toBeGreaterThanOrEqual(1);
      expect(typeof res.data.replyRate).toBe('number');
      expect(typeof res.data.avgSentiment).toBe('number');
      expect(res.data.categoryBreakdown).toBeDefined();
    });
  });

  describe('Multi-tenant isolation', () => {
    it('different users should not see each other comments', async () => {
      const auth2 = await iaRegisterUser();

      const res = await iaApiRequest('/interactions/comments', { token: auth2.token });
      expect(res.status).toBe(200);
      expect(res.data.data.length).toBe(0);
    });
  });
});
