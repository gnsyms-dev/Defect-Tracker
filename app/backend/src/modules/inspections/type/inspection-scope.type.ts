import { UserRole } from '@shared/enums/user-role.enum';
import type { AuthenticatedUser } from '@shared/types/authenticated-user.interface';

/**
 * Who the caller is allowed to see, as a discriminated union.
 *
 * This is the load-bearing piece of the authorization design. It is derived from
 * the authenticated user and NEVER from request input, and it is a *required first
 * parameter* of every read on InspectionsRepositoryPort -- so forgetting to scope a
 * query is a compile error rather than a code-review miss.
 */
export type InspectionScope =
  { readonly kind: 'own'; readonly userId: string } | { readonly kind: 'all' };

export function scopeForUser(user: AuthenticatedUser): InspectionScope {
  return user.role === UserRole.Supervisor
    ? { kind: 'own', userId: user.id }
    : { kind: 'all' };
}
