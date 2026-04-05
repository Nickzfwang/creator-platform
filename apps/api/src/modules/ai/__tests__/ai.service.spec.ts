import { AiService } from '../ai.service';

// Save original env
const originalEnv = process.env.OPENAI_API_KEY;

describe('AiService', () => {
  afterAll(() => {
    process.env.OPENAI_API_KEY = originalEnv;
  });

  describe('without OPENAI_API_KEY', () => {
    let service: AiService;

    beforeEach(() => {
      delete process.env.OPENAI_API_KEY;
      service = new AiService(null as any);
    });

    it('isAvailable should return false', () => {
      expect(service.isAvailable).toBe(false);
    });

    it('chat should return fallback message', async () => {
      const result = await service.chat('system prompt', 'Hello');
      expect(result).toContain('AI 功能尚未啟用');
      expect(result).toContain('Hello');
    });

    it('chatWithHistory should return fallback message', async () => {
      const result = await service.chatWithHistory('system', [
        { role: 'user', content: '請分析數據' },
      ]);
      expect(result).toContain('AI 功能尚未啟用');
    });

    it('generateJson should return null', async () => {
      const result = await service.generateJson('system', 'generate something');
      expect(result).toBeNull();
    });

    it('transcribe should throw error', async () => {
      await expect(service.transcribe('/tmp/test.mp3')).rejects.toThrow();
    });

    it('transcribeVerbose should return empty result', async () => {
      const result = await service.transcribeVerbose('/tmp/test.mp3');
      expect(result.text).toBe('');
      expect(result.words).toEqual([]);
    });

    it('polishSubtitles should return original content', async () => {
      const srt = '1\n00:00:00,000 --> 00:00:01,000\nHello';
      const result = await service.polishSubtitles(srt);
      expect(result).toBe(srt);
    });

    it('generateEmbedding should return null', async () => {
      const result = await service.generateEmbedding('test text');
      expect(result).toBeNull();
    });

    it('generateEmbeddings should return array of nulls', async () => {
      const result = await service.generateEmbeddings(['text1', 'text2']);
      expect(result).toEqual([null, null]);
    });
  });

  describe('with OPENAI_API_KEY', () => {
    let service: AiService;

    beforeEach(() => {
      process.env.OPENAI_API_KEY = 'sk-test-key-for-unit-testing';
      service = new AiService(null as any);
    });

    it('isAvailable should return true', () => {
      expect(service.isAvailable).toBe(true);
    });

    // Note: actual API calls are not tested in unit tests.
    // Integration tests with real API key would go in a separate suite.
  });

  describe('fallback behavior', () => {
    let service: AiService;

    beforeEach(() => {
      delete process.env.OPENAI_API_KEY;
      service = new AiService(null as any);
    });

    it('chat fallback should truncate long messages', async () => {
      const longMsg = 'x'.repeat(200);
      const result = await service.chat('system', longMsg);
      expect(result).toContain('x'.repeat(50));
      expect(result.length).toBeLessThan(200);
    });

    it('generateEmbeddings should handle empty array', async () => {
      const result = await service.generateEmbeddings([]);
      expect(result).toEqual([]);
    });
  });
});
