import { UserRole } from '@shared/enums/user-role.enum';

export const USER_DIRECTORY = Symbol('USER_DIRECTORY');

export interface UserSummary {
  readonly id: string;
  readonly fullName: string;
  readonly role: UserRole;
}

/**
 * The only slice of the user aggregate that leaves this module.
 *
 * The inspections module needs the logger's and resolver's display names. It gets
 * them through this one-method port rather than by injecting `AuthService` or by
 * `include`-ing `UserModel` in its own Sequelize query, for two reasons:
 *
 *  1. Security, via Interface Segregation: `UserEntity` carries `passwordHash`.
 *     Returning a `UserSummary` makes leaking it structurally impossible, where
 *     handing over AuthService would give both a fat interface and the hash.
 *  2. Layering: a Sequelize association would make one module's persistence
 *     adapter compile-time depend on another's. The cost of avoiding it is one
 *     indexed `WHERE id = ANY($1)` against a ~20-row table, batched per page.
 */
export interface UserDirectoryPort {
  findSummariesByIds(ids: readonly string[]): Promise<readonly UserSummary[]>;
}
