import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import {
  Environment,
  EnvironmentVariables,
} from '@config/environment/env.types';
import { ApiResponseDto } from '@shared/dto/api-response.dto';
import { ResponseCode, toResponseCode } from '@shared/enums/response-code.enum';

interface ErrorData {
  readonly path: string;
  readonly timestamp: string;
  readonly stack?: string;
}

// Template: any exception that is neither an HttpException nor one of our
// own future custom error types is treated as an internal server error,
// reported with ResponseCode.InternalServerError ('5000') regardless of
// what the underlying JS error itself looked like.
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const code = isHttpException
      ? toResponseCode(status)
      : ResponseCode.InternalServerError;
    const message = isHttpException
      ? this.extractMessage(exception.getResponse())
      : 'Internal server error';
    const stack = exception instanceof Error ? exception.stack : undefined;

    this.logger.error(
      `${request.method} ${request.originalUrl} -> ${status}`,
      stack,
      GlobalExceptionFilter.name,
    );

    const isProduction =
      this.configService.get('NODE_ENV', { infer: true }) ===
      Environment.Production;

    const data: ErrorData = {
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
      ...(!isProduction && stack ? { stack } : {}),
    };

    response.status(status).json(ApiResponseDto.error(message, code, data));
  }

  // HttpException#getResponse() is a bare string for `new HttpException('msg', status)`,
  // but Nest's built-in exceptions (BadRequestException, class-validator's ValidationPipe, ...)
  // return { statusCode, message, error } where `message` can itself be a string or string[].
  private extractMessage(exceptionResponse: string | object): string {
    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }

    const nestedMessage = (exceptionResponse as { message?: unknown }).message;
    if (typeof nestedMessage === 'string') {
      return nestedMessage;
    }
    if (Array.isArray(nestedMessage)) {
      return nestedMessage.join(', ');
    }

    return JSON.stringify(exceptionResponse);
  }
}
