/**
 * Content Strategy API E2E Tests
 *
 * Tests against the live API server (http://localhost:4000).
 * Covers PRD acceptance criteria for AI topic suggestions,
 * content calendar, competitor tracking, and strategy review.
 */

const CS_API_BASE = 'http://localhost:4000/api/v1';

async function csApiRequest(
  path: string,
  options: { method?: string; body?: object; token?: string } = {},
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;

  const res = await fetch(`${CS_API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  return { status: res.status, data };
}

async function csRegisterUser(): Promise<{ token: string; userId: string }> {
  const email = `e2e-strategy-${Date.now()}@test.com`;
  const res = await csApiRequest('/auth/register', {
    method: 'POST',
    body: { email, password: 'Test1234', displayName: 'Strategy Tester' },
  });
  return { token: res.data.accessToken, userId: res.data.user.id };
}

describe('Content Strategy API E2E', () => {
  let auth: { token: string; userId: string };

  beforeAll(async () => {
    auth = await csRegisterUser();
  }, 15000);

  // ─── Authentication ───

  describe('AC: Authentication checks', () => {
    it('POST /suggestions/generate should return 401 without token', async () => {
      const res = await csApiRequest('/content-strategy/suggestions/generate', {
        method: 'POST',
        body: { niche: '科技' },
      });
      expect(res.status).toBe(401);
    });

    it('GET /suggestions should return 401 without token', async () => {
      const res = await csApiRequest('/content-strategy/suggestions');
      expect(res.status).toBe(401);
    });

    it('GET /calendar should return 401 without token', async () => {
      const res = await csApiRequest('/content-strategy/calendar?startDate=2026-03-01&endDate=2026-03-31');
      expect(res.status).toBe(401);
    });

    it('GET /competitors should return 401 without token', async () => {
      const res = await csApiRequest('/content-strategy/competitors');
      expect(res.status).toBe(401);
    });

    it('GET /review should return 401 without token', async () => {
      const res = await csApiRequest('/content-strategy/review');
      expect(res.status).toBe(401);
    });

    it('GET /settings should return 401 without token', async () => {
      const res = await csApiRequest('/content-strategy/settings');
      expect(res.status).toBe(401);
    });
  });

  // ─── Input Validation ───

  describe('AC: Input validation', () => {
    it('POST /suggestions/:id/adopt should return 400 for invalid UUID', async () => {
      const res = await csApiRequest('/content-strategy/suggestions/not-uuid/adopt', {
        method: 'POST',
        token: auth.token,
        body: { scheduledDate: '2026-04-01' },
      });
      expect(res.status).toBe(400);
    });

    it('POST /calendar should return 400 without required fields', async () => {
      const res = await csApiRequest('/content-strategy/calendar', {
        method: 'POST',
        token: auth.token,
        body: {},
      });
      expect(res.status).toBe(400);
    });

    it('GET /calendar should return 400 without date params', async () => {
      const res = await csApiRequest('/content-strategy/calendar', {
        token: auth.token,
      });
      expect(res.status).toBe(400);
    });

    it('POST /competitors should return 400 with invalid URL', async () => {
      const res = await csApiRequest('/content-strategy/competitors', {
        method: 'POST',
        token: auth.token,
        body: { channelUrl: 'not-a-url' },
      });
      expect(res.status).toBe(400);
    });

    it('PATCH /calendar/:id should return 400 for invalid UUID', async () => {
      const res = await csApiRequest('/content-strategy/calendar/not-uuid', {
        method: 'PATCH',
        token: auth.token,
        body: { title: 'Updated' },
      });
      expect(res.status).toBe(400);
    });
  });

  // ─── Story 1: AI 主題推薦 ───

  describe('AC1: AI Topic Suggestions', () => {
    it('GET /suggestions should return empty list for new user', async () => {
      const res = await csApiRequest('/content-strategy/suggestions', {
        token: auth.token,
      });
      expect(res.status).toBe(200);
      expect(res.data.data).toEqual([]);
      expect(res.data.hasMore).toBe(false);
    });

    it('POST /suggestions/:id/adopt should return 404 for nonexistent suggestion', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000099';
      const res = await csApiRequest(`/content-strategy/suggestions/${fakeId}/adopt`, {
        method: 'POST',
        token: auth.token,
        body: { scheduledDate: '2026-04-01' },
      });
      expect(res.status).toBe(404);
    });

    it('POST /suggestions/:id/dismiss should return 404 for nonexistent suggestion', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000099';
      const res = await csApiRequest(`/content-strategy/suggestions/${fakeId}/dismiss`, {
        method: 'POST',
        token: auth.token,
      });
      expect(res.status).toBe(404);
    });
  });

  // ─── Story 2: 內容日曆 ───

  describe('AC2: Content Calendar', () => {
    let calendarItemId: string;

    it('POST /calendar should create a manual calendar item', async () => {
      const res = await csApiRequest('/content-strategy/calendar', {
        method: 'POST',
        token: auth.token,
        body: {
          title: 'E2E 測試主題',
          scheduledDate: '2026-04-15',
          scheduledTime: '10:00',
          targetPlatforms: ['YOUTUBE'],
          notes: 'E2E test',
        },
      });
      expect(res.status).toBe(201);
      expect(res.data.title).toBe('E2E 測試主題');
      expect(res.data.status).toBe('PLANNED');
      expect(res.data.targetPlatforms).toEqual(['YOUTUBE']);
      calendarItemId = res.data.id;
    });

    it('GET /calendar should return items in date range', async () => {
      const res = await csApiRequest(
        '/content-strategy/calendar?startDate=2026-04-01&endDate=2026-04-30',
        { token: auth.token },
      );
      expect(res.status).toBe(200);
      expect(res.data.items.length).toBeGreaterThanOrEqual(1);
      const item = res.data.items.find((i: any) => i.id === calendarItemId);
      expect(item).toBeDefined();
      expect(item.title).toBe('E2E 測試主題');
    });

    it('PATCH /calendar/:id should update title and notes', async () => {
      const res = await csApiRequest(`/content-strategy/calendar/${calendarItemId}`, {
        method: 'PATCH',
        token: auth.token,
        body: { title: '更新後主題', notes: 'Updated via E2E' },
      });
      expect(res.status).toBe(200);
      expect(res.data.title).toBe('更新後主題');
      expect(res.data.notes).toBe('Updated via E2E');
    });

    it('PATCH /calendar/:id should transition PLANNED → IN_PRODUCTION', async () => {
      const res = await csApiRequest(`/content-strategy/calendar/${calendarItemId}`, {
        method: 'PATCH',
        token: auth.token,
        body: { status: 'IN_PRODUCTION' },
      });
      expect(res.status).toBe(200);
      expect(res.data.status).toBe('IN_PRODUCTION');
    });

    it('PATCH /calendar/:id should reject IN_PRODUCTION → PUBLISHED without videoId', async () => {
      const res = await csApiRequest(`/content-strategy/calendar/${calendarItemId}`, {
        method: 'PATCH',
        token: auth.token,
        body: { status: 'PUBLISHED' },
      });
      expect(res.status).toBe(400);
    });

    it('PATCH /calendar/:id should reject invalid status transition', async () => {
      const res = await csApiRequest(`/content-strategy/calendar/${calendarItemId}`, {
        method: 'PATCH',
        token: auth.token,
        body: { status: 'SUGGESTED' },
      });
      expect(res.status).toBe(400);
    });

    it('DELETE /calendar/:id should delete non-published item', async () => {
      // Create a temporary item to delete
      const createRes = await csApiRequest('/content-strategy/calendar', {
        method: 'POST',
        token: auth.token,
        body: { title: '要刪除的項目', scheduledDate: '2026-04-20' },
      });
      expect(createRes.status).toBe(201);

      const deleteRes = await csApiRequest(`/content-strategy/calendar/${createRes.data.id}`, {
        method: 'DELETE',
        token: auth.token,
      });
      expect(deleteRes.status).toBe(204);
    });
  });

  // ─── Story 4: 競品追蹤 ───

  describe('AC4: Competitor Tracking', () => {
    it('GET /competitors should return empty list for new user', async () => {
      const res = await csApiRequest('/content-strategy/competitors', {
        token: auth.token,
      });
      expect(res.status).toBe(200);
      expect(res.data.competitors).toEqual([]);
      expect(res.data.quota).toBeDefined();
      expect(res.data.quota.used).toBe(0);
    });

    it('POST /competitors should reject non-YouTube URL', async () => {
      const res = await csApiRequest('/content-strategy/competitors', {
        method: 'POST',
        token: auth.token,
        body: { channelUrl: 'https://www.google.com/search?q=test' },
      });
      expect(res.status).toBe(400);
    });

    it('POST /competitors should add a YouTube channel', async () => {
      const res = await csApiRequest('/content-strategy/competitors', {
        method: 'POST',
        token: auth.token,
        body: { channelUrl: 'https://www.youtube.com/@testyoutubechannel' },
      });
      expect(res.status).toBe(201);
      expect(res.data.channelId).toBe('@testyoutubechannel');
      expect(res.data.channelName).toBeDefined();
    });

    it('POST /competitors should reject duplicate channel', async () => {
      const res = await csApiRequest('/content-strategy/competitors', {
        method: 'POST',
        token: auth.token,
        body: { channelUrl: 'https://www.youtube.com/@testyoutubechannel' },
      });
      expect(res.status).toBe(409);
    });

    it('GET /competitors should list tracked channels', async () => {
      const res = await csApiRequest('/content-strategy/competitors', {
        token: auth.token,
      });
      expect(res.status).toBe(200);
      expect(res.data.competitors.length).toBe(1);
      expect(res.data.quota.used).toBe(1);
    });

    it('GET /competitors/analysis should return analysis', async () => {
      const res = await csApiRequest('/content-strategy/competitors/analysis', {
        token: auth.token,
      });
      expect(res.status).toBe(200);
      expect(res.data.generatedAt).toBeDefined();
    });

    it('DELETE /competitors/:id should remove a competitor', async () => {
      // Get the competitor ID first
      const listRes = await csApiRequest('/content-strategy/competitors', {
        token: auth.token,
      });
      const competitorId = listRes.data.competitors[0].id;

      const deleteRes = await csApiRequest(`/content-strategy/competitors/${competitorId}`, {
        method: 'DELETE',
        token: auth.token,
      });
      expect(deleteRes.status).toBe(204);

      // Verify deleted
      const afterRes = await csApiRequest('/content-strategy/competitors', {
        token: auth.token,
      });
      expect(afterRes.data.competitors.length).toBe(0);
    });
  });

  // ─── Story 5: 策略回顧 ───

  describe('AC5: Strategy Review', () => {
    it('GET /review should return summary for new user', async () => {
      const res = await csApiRequest('/content-strategy/review?period=month', {
        token: auth.token,
      });
      expect(res.status).toBe(200);
      expect(res.data.summary).toBeDefined();
      expect(res.data.summary.totalSuggested).toBe(0);
      expect(res.data.summary.adoptionRate).toBe(0);
    });

    it('GET /review/insights should return insights', async () => {
      const res = await csApiRequest('/content-strategy/review/insights?period=month', {
        token: auth.token,
      });
      expect(res.status).toBe(200);
      expect(res.data.insights).toBeDefined();
      expect(res.data.generatedAt).toBeDefined();
    }, 30000);
  });

  // ─── Settings ───

  describe('Settings', () => {
    it('GET /settings should return default settings', async () => {
      const res = await csApiRequest('/content-strategy/settings', {
        token: auth.token,
      });
      expect(res.status).toBe(200);
      expect(res.data.preferredFrequency).toBe(3);
      expect(res.data.autoGenerateEnabled).toBe(true);
      expect(res.data.preferredGenerateDay).toBe(1);
      expect(res.data.preferredGenerateHour).toBe(9);
    });

    it('PATCH /settings should update settings', async () => {
      const res = await csApiRequest('/content-strategy/settings', {
        method: 'PATCH',
        token: auth.token,
        body: { niche: '科技', preferredFrequency: 5 },
      });
      expect(res.status).toBe(200);
      expect(res.data.niche).toBe('科技');
      expect(res.data.preferredFrequency).toBe(5);
    });
  });

  // ─── Cross-tenant isolation ───

  describe('Multi-tenant isolation', () => {
    it('should not see other tenant calendar items', async () => {
      // Register a second user
      const auth2 = await csRegisterUser();

      // Create item as user 1
      await csApiRequest('/content-strategy/calendar', {
        method: 'POST',
        token: auth.token,
        body: { title: 'User 1 Item', scheduledDate: '2026-05-01' },
      });

      // User 2 should not see it
      const res = await csApiRequest(
        '/content-strategy/calendar?startDate=2026-05-01&endDate=2026-05-31',
        { token: auth2.token },
      );
      expect(res.status).toBe(200);
      const user1Items = res.data.items.filter((i: any) => i.title === 'User 1 Item');
      expect(user1Items.length).toBe(0);
    });
  });
});
