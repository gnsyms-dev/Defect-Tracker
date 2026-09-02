import { UserRole } from '@shared/enums/user-role.enum';

// The shape JwtAuthGuard attaches to the request and @CurrentUser() hands to a
// controller. Deliberately NOT the domain user entity: that one carries
// passwordHash, which must never travel on a request object.
//
// role and plantId are loaded from the database on every request rather than read
// from JWT claims -- they are authorization inputs, and a stale plantId would leak
// another plant's data.
export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly role: UserRole;
  readonly plantId: string;
}
