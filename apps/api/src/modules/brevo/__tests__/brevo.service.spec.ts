import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BrevoService } from '../brevo.service';

describe('BrevoService', () => {
  const configMap: Record<string, string | number> = {
    BREVO_API_KEY: '',
    BREVO_SENDER_EMAIL: 'noreply@test.com',
    BREVO_SENDER_NAME: 'Test Platform',
    BREVO_TEMPLATE_DAILY_SUMMARY: 1,
    BREVO_TEMPLATE_NOTIFICATION: 2,
    FRONTEND_URL: 'http://localhost:3001',
  };

  function createService(overrides: Record<string, string | number> = {}) {
    const merged = { ...configMap, ...overrides };
    const mockConfig = {
      get: jest.fn((key: string, def?: unknown) => merged[key] ?? def),
    };
    // Use direct instantiation to avoid Test.createTestingModule overhead
    const service = new BrevoService(mockConfig as unknown as ConfigService);
    return service;
  }

  describe('isConfigured', () => {
    it('should return false when no API key', () => {
      const service = createService({ BREVO_API_KEY: '' });
      expect(service.isConfigured).toBe(false);
    });

    it('should return true when API key is set', () => {
      const service = createService({ BREVO_API_KEY: 'xkeysib-test-key' });
      expect(service.isConfigured).toBe(true);
    });
  });

  describe('sendTrendDailySummary (no API key)', () => {
    it('should return without error when not configured', async () => {
      const service = createService();

      // Should not throw
      await expect(
        service.sendTrendDailySummary('user@test.com', 'User', [
          { title: 'AI Trend', summary: 'AI is growing', category: '科技', relevanceScore: 0.85 },
        ], 'AI analysis text'),
      ).resolves.toBeUndefined();
    });
  });

  describe('sendNotificationEmail (no API key)', () => {
    it('should return without error when not configured', async () => {
      const service = createService();

      await expect(
        service.sendNotificationEmail('user@test.com', 'Test Title', 'Test Body'),
      ).resolves.toBeUndefined();
    });
  });

  describe('sendCampaignEmail (no API key)', () => {
    it('should return success:false when not configured', async () => {
      const service = createService();

      const result = await service.sendCampaignEmail(
        [{ email: 'user@test.com', name: 'User' }],
        'Campaign Subject',
        '<h1>Hello</h1>',
      );

      expect(result.success).toBe(false);
    });
  });

  describe('sendCampaignEmail (with API key, mock fetch)', () => {
    let service: BrevoService;
    let fetchSpy: jest.SpyInstance;

    beforeEach(() => {
      service = createService({ BREVO_API_KEY: 'xkeysib-test-key' });
      fetchSpy = jest.spyOn(global, 'fetch');
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it('should call Brevo API and return success', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ messageId: 'msg-123' }),
      } as any);

      const result = await service.sendCampaignEmail(
        [{ email: 'user@test.com', name: 'User' }],
        'Test Campaign',
        '<p>Hello</p>',
      );

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('msg-123');
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.brevo.com/v3/smtp/email',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'api-key': 'xkeysib-test-key' }),
        }),
      );
    });

    it('should append unsubscribe footer when URL provided', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ messageId: 'msg-456' }),
      } as any);

      await service.sendCampaignEmail(
        [{ email: 'user@test.com', name: 'User' }],
        'Campaign',
        '<p>Content</p>',
        'https://example.com/unsubscribe',
      );

      const callBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(callBody.htmlContent).toContain('取消訂閱');
      expect(callBody.htmlContent).toContain('https://example.com/unsubscribe');
      expect(callBody.headers['List-Unsubscribe']).toContain('https://example.com/unsubscribe');
    });

    it('should return success:false on API error', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad Request'),
      } as any);

      const result = await service.sendCampaignEmail(
        [{ email: 'user@test.com', name: 'User' }],
        'Campaign',
        '<p>Content</p>',
      );

      expect(result.success).toBe(false);
    });

    it('should return success:false on network error', async () => {
      fetchSpy.mockRejectedValue(new Error('Network error'));

      const result = await service.sendCampaignEmail(
        [{ email: 'user@test.com', name: 'User' }],
        'Campaign',
        '<p>Content</p>',
      );

      expect(result.success).toBe(false);
    });
  });

  describe('sendTrendDailySummary (with API key, mock fetch)', () => {
    let service: BrevoService;
    let fetchSpy: jest.SpyInstance;

    beforeEach(() => {
      service = createService({ BREVO_API_KEY: 'xkeysib-test-key' });
      fetchSpy = jest.spyOn(global, 'fetch');
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it('should send template email with mapped topics', async () => {
      fetchSpy.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) } as any);

      await service.sendTrendDailySummary('user@test.com', 'Creator', [
        { title: 'AI Tools', summary: 'New AI tools', category: '科技', relevanceScore: 0.92 },
      ], 'AI insight');

      const callBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(callBody.templateId).toBe(1);
      expect(callBody.params.topics[0].score).toBe(92); // 0.92 * 100
      expect(callBody.params.aiAnalysis).toBe('AI insight');
    });
  });
});
