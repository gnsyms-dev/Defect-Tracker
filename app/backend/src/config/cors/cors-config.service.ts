import { Injectable } from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../environment/env.types';

@Injectable()
export class CorsConfigService {
  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  isCorsEnabled(): boolean {
    return this.configService.get('CORS_ENABLED', { infer: true });
  }

  getCorsConfig(): CorsOptions {
    return {
      origin: this.parseOrigin(
        this.configService.get('CORS_ALLOWED_ORIGINS', { infer: true }),
      ),
      methods: this.splitAndTrim(
        this.configService.get('CORS_ALLOWED_METHODS', { infer: true }),
      ),
      allowedHeaders: this.splitAndTrim(
        this.configService.get('CORS_ALLOWED_HEADERS', { infer: true }),
      ),
      credentials: this.configService.get('CORS_CREDENTIALS', {
        infer: true,
      }),
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
