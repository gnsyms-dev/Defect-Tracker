import { createContext } from 'react';
import type { AuthSession } from '../../application/domain/entities/AuthSession';
import type { LoginCredentials } from '../../application/ports/AuthRepository';

export interface AuthContextValue {
  readonly session: AuthSession;
  readonly userId: string | null;
  login(credentials: LoginCredentials): Promise<void>;
  /** Clears the session. Callers are responsible for the unsynced-work check first. */
  logout(): void;
  /** Re-authenticate from the expired state without losing the current screen. */
  reauthenticate(credentials: LoginCredentials): Promise<void>;
}

/**
 * The context object is separated from the provider component and from the consumer
 * hook so each file exports only one kind of thing -- what React Fast Refresh needs to
 * hot-reload a component without discarding its state.
 */
export const AuthContext = createContext<AuthContextValue | null>(null);
