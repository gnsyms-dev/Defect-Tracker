import { AuthUserEntity } from '../domain/entities/auth-user.entity';

export interface AuthResult {
  readonly user: AuthUserEntity;
  readonly accessToken: string;
}
