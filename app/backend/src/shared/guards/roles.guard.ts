import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from '@shared/decorators/roles.decorator';
import { UserRole } from '@shared/enums/user-role.enum';
import type { AuthenticatedUser } from '@shared/types/authenticated-user.interface';

// Registered as an APP_GUARD *after* JwtAuthGuard, so request.user is already
// populated by the time this runs.
//
// Lives in shared/ rather than the auth module because it imports only Reflector,
// the @Roles() metadata key and UserRole -- all of which are themselves in shared.
// JwtAuthGuard cannot live here: it needs JwtService and the user repository, both
// owned by the auth module.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<
      readonly UserRole[] | undefined
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);

    // No @Roles() means "any authenticated user" -- e.g. GET /auth/me. This is
    // fail-open for authorization, which is inherent to annotation-driven roles;
    // the compensating control is the annotate-everything convention on the
    // decorator, not tightening it here (that would break /auth/me).
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      // Reachable only if a route carries @Roles() and @Public() together, which
      // is a wiring mistake worth failing loudly on rather than allowing.
      throw new ForbiddenException(
        'Route requires a role but no authenticated user is present.',
      );
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        'Your role does not have access to this action.',
      );
    }

    return true;
  }
}
