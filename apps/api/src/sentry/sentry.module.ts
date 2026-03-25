import { Global, Module } from '@nestjs/common';
import { SentryService } from './sentry.service';
import { SentryExceptionFilter } from './sentry-exception.filter';

@Global()
@Module({
  providers: [SentryService, SentryExceptionFilter],
  exports: [SentryService, SentryExceptionFilter],
})
export class SentryModule {}
