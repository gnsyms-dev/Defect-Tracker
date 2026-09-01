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
      origin: this.splitAndTrim(
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

  private splitAndTrim(value: string): string[] {
    return value.split(',').map((entry) => entry.trim());
  }
}
