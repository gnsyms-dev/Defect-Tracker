import { UserRole } from '@shared/enums/user-role.enum';

/**
 * The full user aggregate, including `passwordHash`.
 *
 * This type must never leave the auth module: that is precisely why other modules
 * consume the narrow `UserDirectoryPort` (which yields a `UserSummary` with no
 * hash) instead of importing this or injecting AuthService.
 */
export class UserEntity {
  constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly passwordHash: string,
    public readonly fullName: string,
    public readonly role: UserRole,
    public readonly plantId: string,
    public readonly isActive: boolean,
    public readonly lastLoginAt: Date | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}
}
