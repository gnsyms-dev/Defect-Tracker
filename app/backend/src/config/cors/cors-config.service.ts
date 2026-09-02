import { Injectable, Logger } from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../environment/env.types';

@Injectable()
export class CorsConfigService {
  private readonly logger = new Logger(CorsConfigService.name);

  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  isCorsEnabled(): boolean {
    const isEnabled = this.configService.get('CORS_ENABLED', { infer: true });
    this.logger.log(`CORS ${isEnabled ? 'enabled' : 'disabled'}`);
    return isEnabled;
  }

  getCorsConfig(): CorsOptions {
    const origin = this.parseOrigin(
      this.configService.get('CORS_ALLOWED_ORIGINS', { infer: true }),
    );
    const methods = this.splitAndTrim(
      this.configService.get('CORS_ALLOWED_METHODS', { infer: true }),
    );
    const credentials = this.configService.get('CORS_CREDENTIALS', {
      infer: true,
    });

    // A blocked browser call surfaces client-side as an indistinguishable
    // TypeError (see parseOrigin below), so the effective policy is recorded at
    // boot -- that log line is usually the fastest way to tell a CORS
    // misconfiguration apart from a genuinely unreachable backend.
    this.logger.log(
      `CORS policy origin=${Array.isArray(origin) ? origin.join('|') : origin} methods=${methods.join('|')} credentials=${credentials ? 'yes' : 'no'}`,
    );

    return {
      origin,
      methods,
      allowedHeaders: this.splitAndTrim(
        this.configService.get('CORS_ALLOWED_HEADERS', { infer: true }),
      ),
      credentials,
      exposedHeaders: ['Content-Disposition'],
    };
  }

  // The `cors` package only takes its "allow any origin" shortcut when `origin` is
  // the bare string '*'. Handing it ['*'] instead falls through to exact-string
  // matching, which never matches a real Origin header, so the
  // Access-Control-Allow-Origin header is omitted and every browser call is blocked.
  // Worse, the browser reports that as a `TypeError` from fetch() -- indistinguishable
  // from being offline -- so a client with offline queueing would silently queue
  // everything instead of surfacing a CORS error.
  private parseOrigin(value: string): string | string[] {
    const trimmed = value.trim();
    return trimmed === '*' ? '*' : this.splitAndTrim(trimmed);
  }

  private splitAndTrim(value: string): string[] {
    return value.split(',').map((entry) => entry.trim());
  }
}
