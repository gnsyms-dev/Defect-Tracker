import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@shared/enums/user-role.enum';

export const ROLES_KEY = 'roles';

// Convention: annotate EVERY authenticated endpoint explicitly, even when it lists
// both roles. RolesGuard treats absent metadata as "any authenticated user", so a
// forgotten @Roles() is invisible in review unless annotating is the habit.
export const Roles = (
  ...roles: readonly UserRole[]
): MethodDecorator & ClassDecorator => SetMetadata(ROLES_KEY, roles);
