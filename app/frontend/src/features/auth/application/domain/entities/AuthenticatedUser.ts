import type { UserRole } from '../UserRole';

export interface UserPlant {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly role: UserRole;
  readonly plantId: string;
  readonly plant: UserPlant | null;
}
