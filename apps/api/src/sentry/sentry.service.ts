import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';

@Injectable()
export class SentryService implements OnModuleInit {
  private readonly logger = new Logger(SentryService.name);
  private initialized = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const dsn = this.config.get<string>('SENTRY_DSN');

    if (!dsn) {
      this.logger.warn('SENTRY_DSN not set — error tracking disabled');
      return;
    }

    Sentry.init({
      dsn,
      environment: this.config.get<string>('NODE_ENV', 'development'),
      tracesSampleRate: this.config.get<number>('SENTRY_TRACES_SAMPLE_RATE', 0.1),
      integrations: [
        Sentry.httpIntegration(),
      ],
    });

    this.initialized = true;
    this.logger.log('Sentry initialized for error tracking');
  }

  captureException(error: Error, context?: Record<string, unknown>) {
    if (!this.initialized) return;

    Sentry.withScope((scope) => {
      if (context) {
        scope.setExtras(context);
      }
      Sentry.captureException(error);
    });
  }

  captureMessage(message: string, level: Sentry.SeverityLevel = 'info') {
    if (!this.initialized) return;
    Sentry.captureMessage(message, level);
  }

  setUser(user: { id: string; email?: string; tenantId?: string }) {
    if (!this.initialized) return;
    Sentry.setUser(user);
  }
}
