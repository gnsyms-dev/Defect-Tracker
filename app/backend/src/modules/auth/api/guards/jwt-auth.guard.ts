import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '@shared/decorators/public.decorator';
import type { AuthenticatedUser } from '@shared/types/authenticated-user.interface';
import { AuthService } from '../../domain/services/auth.service';
import { AuthErrorMessage } from '../../type/auth.error.message';
import { TOKEN_ISSUER } from '../../type/token-issuer.port';
import type { TokenIssuerPort } from '../../type/token-issuer.port';

/**
 * Registered globally as an APP_GUARD, with `@Public()` as the opt-out. That
 * direction is chosen for fail-closed behaviour: with opt-in guards, forgetting a
 * decorator on a new controller silently ships an unauthenticated endpoint (and
 * `GET /inspections` without scoping is a cross-plant data leak), whereas
 * forgetting `@Public()` produces a loud 401 on the first request in development.
 *
 * Hand-written rather than passport-jwt: one dependency instead of four, no strategy
 * indirection, and -- decisively for this repo -- passport types `req.user` as the
 * empty `Express.User`, so consuming it needs a global module augmentation or a
 * cast, both of which fight the project's no-`any` / no-`as` rules.
 *
 * It lives in the auth module, not shared/, because it needs the token issuer and
 * the user repository. Only `@Public()` itself is generic enough for shared/.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
    @Inject(TOKEN_ISSUER)
    private readonly tokenIssuer: TokenIssuerPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();

    const token = JwtAuthGuard.extractBearerToken(
      request.headers.authorization,
    );
    if (!token) {
      throw new UnauthorizedException(AuthErrorMessage.MissingToken);
    }

    const verified = await this.tokenIssuer.verify(token);
    if (!verified) {
      throw new UnauthorizedException(AuthErrorMessage.InvalidToken);
    }

    // A structurally valid token whose user has since been deactivated (or deleted)
    // must not authenticate. This lookup is what gives us revocation without a
    // refresh-token table.
    const user = await this.authService.resolveAuthenticatedUser(
      verified.userId,
    );
    if (!user) {
      throw new UnauthorizedException(AuthErrorMessage.AccountUnavailable);
    }

    request.user = user;
    return true;
  }

  private static extractBearerToken(
    authorizationHeader: string | undefined,
  ): string | null {
    if (!authorizationHeader) {
      return null;
    }
    const [scheme, value] = authorizationHeader.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !value) {
      return null;
    }
    const token = value.trim();
    return token.length > 0 ? token : null;
  }
}
