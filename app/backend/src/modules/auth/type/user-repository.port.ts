import { UserEntity } from '../domain/entities/user.entity';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

// No `create`: accounts are seeded, and registration was deliberately removed
// (a self-assigned role would grant defect-resolution authority). Add it back
// alongside a designed invite flow, not before.
export interface UserRepositoryPort {
  findByEmail(email: string): Promise<UserEntity | null>;
  findById(id: string): Promise<UserEntity | null>;
  touchLastLogin(id: string, at: Date): Promise<void>;
}
