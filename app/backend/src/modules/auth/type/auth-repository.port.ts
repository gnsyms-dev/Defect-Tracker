import { AuthUserEntity } from '../domain/entities/auth-user.entity';
import { UserRole } from './auth.enum';

export const AUTH_REPOSITORY = Symbol('AUTH_REPOSITORY');

export interface CreateAuthUserData {
  readonly email: string;
  readonly passwordHash: string;
  readonly role: UserRole;
}

export interface AuthRepositoryPort {
  findByEmail(email: string): Promise<AuthUserEntity | null>;
  create(data: CreateAuthUserData): Promise<AuthUserEntity>;
}
