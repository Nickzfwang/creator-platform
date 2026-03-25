import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { SentryService } from './sentry.service';

@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SentryExceptionFilter.name);

  constructor(private readonly sentry: SentryService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Only report 5xx errors to Sentry (not client errors)
    if (status >= 500 && exception instanceof Error) {
      this.sentry.captureException(exception, {
        url: request.url,
        method: request.method,
        statusCode: status,
        userId: (request as any).user?.id,
      });
    }

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : { statusCode: 500, message: '伺服器內部錯誤' };

    const body = typeof message === 'string'
      ? { statusCode: status, message }
      : message;

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json(body);
  }
}
