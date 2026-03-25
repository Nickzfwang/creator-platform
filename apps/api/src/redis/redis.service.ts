import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis | null;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('REDIS_HOST', 'localhost');
    const port = this.config.get<number>('REDIS_PORT', 6379);

    try {
      this.client = new Redis({
        host,
        port,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      this.client.connect().catch((err) => {
        this.logger.warn(`Redis connection failed: ${err.message} — caching disabled`);
        this.client?.disconnect();
      });
    } catch {
      this.logger.warn('Redis not available — caching disabled');
      this.client = null;
    }
  }

  async onModuleDestroy() {
    await this.client?.quit();
  }

  get isAvailable(): boolean {
    return this.client?.status === 'ready';
  }

  /**
   * Get cached value. Returns null if not found or Redis unavailable.
   */
  async get<T = string>(key: string): Promise<T | null> {
    if (!this.isAvailable) return null;
    try {
      const val = await this.client!.get(key);
      if (!val) return null;
      try {
        return JSON.parse(val) as T;
      } catch {
        return val as unknown as T;
      }
    } catch {
      return null;
    }
  }

  /**
   * Set cached value with TTL in seconds.
   */
  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.isAvailable) return;
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      await this.client!.set(key, serialized, 'EX', ttlSeconds);
    } catch {
      // Silent fail — caching is best-effort
    }
  }

  /**
   * Delete a cached key.
   */
  async del(key: string): Promise<number> {
    if (!this.isAvailable) return 0;
    try {
      return await this.client!.del(key);
    } catch {
      return 0;
    }
  }

  /**
   * Delete keys matching a pattern.
   */
  async delPattern(pattern: string): Promise<number> {
    if (!this.isAvailable) return 0;
    try {
      const keys = await this.client!.keys(pattern);
      if (keys.length === 0) return 0;
      return await this.client!.del(...keys);
    } catch {
      return 0;
    }
  }

  /**
   * Cache-aside pattern: get from cache, or fetch and cache.
   */
  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const value = await fetcher();
    await this.set(key, value, ttlSeconds);
    return value;
  }
}
