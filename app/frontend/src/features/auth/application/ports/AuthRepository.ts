import type { AuthenticatedUser } from '../domain/entities/AuthenticatedUser';

export interface LoginCredentials {
  readonly email: string;
  readonly password: string;
}

export interface LoginResult {
  readonly user: AuthenticatedUser;
  readonly accessToken: string;
  readonly expiresInSeconds: number;
}

export interface AuthRepository {
  login(credentials: LoginCredentials): Promise<LoginResult>;
  /**
   * Revalidates a restored session and refreshes role/plant.
   *
   * Needed precisely because the backend deliberately keeps role and plantId OUT of
   * the JWT claims -- they are authorization inputs read from the database per
   * request, so the client must not infer them by decoding the token either.
   */
  fetchCurrentUser(): Promise<AuthenticatedUser>;
}
