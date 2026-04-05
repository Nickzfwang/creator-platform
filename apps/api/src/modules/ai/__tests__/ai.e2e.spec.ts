const AI_API_BASE = 'http://localhost:4000/api/v1';

async function aiApiRequest(path: string, options: { method?: string; body?: object; token?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;
  const res = await fetch(`${AI_API_BASE}${path}`, {
    method: options.method ?? 'GET', headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : undefined };
}

async function aiRegister(): Promise<string> {
  const email = `e2e-ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`;
  const res = await aiApiRequest('/auth/register', {
    method: 'POST', body: { email, password: 'Test1234', displayName: 'AI Tester' },
  });
  return res.data.accessToken;
}

describe('AI API E2E', () => {
  let token: string;

  beforeAll(async () => { token = await aiRegister(); }, 15000);

  describe('Auth guards', () => {
    it('POST /ai/chat → 401', async () => {
      expect((await aiApiRequest('/ai/chat', { method: 'POST', body: { message: 'hi' } })).status).toBe(401);
    });

    it('POST /ai/generate-script → 401', async () => {
      expect((await aiApiRequest('/ai/generate-script', { method: 'POST', body: { topic: 'test' } })).status).toBe(401);
    });
  });

  describe('POST /ai/chat', () => {
    it('should return a reply', async () => {
      const res = await aiApiRequest('/ai/chat', {
        method: 'POST', token,
        body: { message: '你好，我是創作者' },
      });

      expect(res.status).toBe(200);
      expect(res.data.reply).toBeDefined();
      expect(typeof res.data.reply).toBe('string');
    });

    it('should accept conversation history', async () => {
      const res = await aiApiRequest('/ai/chat', {
        method: 'POST', token,
        body: {
          message: '接下來該怎麼做？',
          history: [
            { role: 'user', content: '我想增加 YouTube 訂閱數' },
            { role: 'assistant', content: '建議先分析目前的內容策略' },
          ],
        },
      });

      expect(res.status).toBe(200);
      expect(res.data.reply).toBeDefined();
    });
  });

  describe('POST /ai/generate-script', () => {
    it('should generate a script', async () => {
      const res = await aiApiRequest('/ai/generate-script', {
        method: 'POST', token,
        body: { topic: '如何開始 YouTube 頻道' },
      });

      expect(res.status).toBe(200);
      expect(res.data.script).toBeDefined();
      expect(res.data.topic).toBe('如何開始 YouTube 頻道');
      expect(res.data.generatedAt).toBeDefined();
    }, 30000);

    it('should accept optional parameters', async () => {
      const res = await aiApiRequest('/ai/generate-script', {
        method: 'POST', token,
        body: {
          topic: 'AI 工具推薦',
          style: 'educational',
          targetLength: 10,
          targetAudience: '科技新手',
        },
      });

      expect(res.status).toBe(200);
      expect(res.data.script).toBeDefined();
    }, 30000);
  });
});
