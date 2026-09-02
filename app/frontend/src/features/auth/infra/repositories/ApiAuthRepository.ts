import type { HttpClient } from '@/shared/api/HttpClient';
import type {
  AuthRepository,
  LoginCredentials,
  LoginResult,
} from '../../application/ports/AuthRepository';
import type { AuthenticatedUser } from '../../application/domain/entities/AuthenticatedUser';
import {
  authenticatedUserDtoSchema,
  loginResponseDtoSchema,
  type LoginRequestDto,
} from '../dto/AuthDto';
import { AuthMapper } from '../dto/AuthMapper';

export class ApiAuthRepository implements AuthRepository {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async login(credentials: LoginCredentials): Promise<LoginResult> {
    const body: LoginRequestDto = {
      email: credentials.email,
      password: credentials.password,
    };

    const dto = await this.http.request(
      {
        path: '/auth/login',
        method: 'POST',
        body,
        // The only endpoint that must not send a bearer token.
        isAuthRequired: false,
      },
      loginResponseDtoSchema,
    );

    return AuthMapper.toLoginResult(dto);
  }

  async fetchCurrentUser(): Promise<AuthenticatedUser> {
    const dto = await this.http.request(
      { path: '/auth/me' },
      authenticatedUserDtoSchema,
    );
    return AuthMapper.toDomain(dto);
  }
}
