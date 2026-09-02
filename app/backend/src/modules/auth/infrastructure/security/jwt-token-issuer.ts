import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '@config/environment/env.types';
import type { JwtPayload } from '../../type/jwt-payload.interface';
import type {
  IssuedToken,
  TokenIssuerPort,
  VerifiedToken,
} from '../../type/token-issuer.port';

@Injectable()
export class JwtTokenIssuer implements TokenIssuerPort {
  private readonly logger = new Logger(JwtTokenIssuer.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  async issue(userId: string, email: string): Promise<IssuedToken> {
    const payload: JwtPayload = { sub: userId, email };
    const accessToken = await this.jwtService.signAsync(payload);
    return {
      accessToken,
      expiresInSeconds: this.resolveExpiresInSeconds(),
    };
  }

  async verify(token: string): Promise<VerifiedToken | null> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      // Guard the claim rather than trusting the generic: verifyAsync's type
      // parameter is an assertion, not a runtime check.
      if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
        return null;
      }
      return { userId: payload.sub };
    } catch (err) {
      // Expected for expired or tampered tokens, so this is debug-level, not an
      // error -- but it is logged rather than swallowed silently.
      this.logger.debug(
        `Token verification failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
      return null;
    }
  }

  // The client needs the lifetime in seconds so it can pre-empt an expiry rather
  // than discovering it as a 401 mid-flush. JWT_EXPIRES_IN is validated at boot as
  // either a bare number of seconds or an ms-style duration.
  private resolveExpiresInSeconds(): number {
    const raw = this.configService.get('JWT_EXPIRES_IN', { infer: true });
    const match = /^(\d+)(ms|s|m|h|d)?$/.exec(raw);
    if (!match) {
      return 0;
    }
    const amount = Number(match[1]);
    switch (match[2]) {
      case 'ms':
        return Math.floor(amount / 1000);
      case 'm':
        return amount * 60;
      case 'h':
        return amount * 3600;
      case 'd':
        return amount * 86400;
      // A bare number is seconds, matching @nestjs/jwt's own interpretation.
      case 's':
      default:
        return amount;
    }
  }
}
