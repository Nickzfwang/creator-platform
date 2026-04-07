import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { I18nContext } from 'nestjs-i18n';
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

    const exceptionResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : { statusCode: 500, message: 'errors.common.internalError' };

    // Translate i18n keys in error messages
    const i18n = I18nContext.current();
    let body: any;

    if (typeof exceptionResponse === 'string') {
      const translated = this.tryTranslate(i18n, exceptionResponse);
      body = { statusCode: status, message: translated };
    } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const resp = exceptionResponse as any;
      if (typeof resp.message === 'string') {
        resp.message = this.tryTranslate(i18n, resp.message);
      } else if (Array.isArray(resp.message)) {
        resp.message = resp.message.map((m: string) =>
          typeof m === 'string' ? this.tryTranslate(i18n, m) : m,
        );
      }
      body = resp;
    } else {
      body = exceptionResponse;
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json(body);
  }

  /**
   * Try to translate a message key. If it looks like an i18n key (contains a dot
   * and starts with "errors."), translate it. Otherwise return as-is.
   */
  private tryTranslate(i18n: I18nContext | undefined, message: string): string {
    if (!i18n || !message.startsWith('errors.')) return message;
    const translated = i18n.t(message) as string;
    // If translation returns the key itself, it wasn't found — return original
    return translated === message ? message : translated;
  }
}
