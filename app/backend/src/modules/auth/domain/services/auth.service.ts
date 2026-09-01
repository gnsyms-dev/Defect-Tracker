import { Inject, Injectable } from '@nestjs/common';
import { AUTH_REPOSITORY } from '../../type/auth-repository.port';
import type { AuthRepositoryPort } from '../../type/auth-repository.port';
import type { AuthResult } from '../../type/auth-result.interface';

@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: AuthRepositoryPort,
  ) {}

  async register(_email: string, _password: string): Promise<AuthResult> {
    // TODO: implement registration logic
    throw new Error('Not implemented');
  }

  async login(_email: string, _password: string): Promise<AuthResult> {
    // TODO: implement login logic
    throw new Error('Not implemented');
  }
}
