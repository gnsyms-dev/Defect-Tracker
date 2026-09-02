import type { AuthenticatedUser } from '../domain/entities/AuthenticatedUser';

export interface PersistedSession {
  readonly user: AuthenticatedUser;
  readonly accessToken: string;
  readonly expiresAt: number;
}

export interface SessionStore {
  read(): PersistedSession | null;
  write(session: PersistedSession): void;
  clear(): void;
}
