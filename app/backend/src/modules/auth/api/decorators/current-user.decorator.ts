import {
  createParamDecorator,
  InternalServerErrorException,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '@shared/types/authenticated-user.interface';

/**
 * Hands a controller the identity JwtAuthGuard resolved for this request.
 *
 * Throws rather than returning `undefined` when the guard has not run: that only
 * happens if a route is marked `@Public()` while still asking for `@CurrentUser()`,
 * which is a wiring bug. Failing loudly here avoids every downstream consumer
 * needing a null check for a state that should be impossible.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();

    if (!request.user) {
      throw new InternalServerErrorException(
        'No authenticated user on the request. A route using @CurrentUser() must not be @Public().',
      );
    }

    return request.user;
  },
);
