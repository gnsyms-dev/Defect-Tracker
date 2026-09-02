import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { isApiError } from '@/shared/api/errors';
import { AuthContext, type AuthContextValue } from './auth-context';
import type { SessionTokenHolder, UnauthorizedNotifier } from '@/app/di/sessionTokenHolder';
import type { AuthSession } from '../../application/domain/entities/AuthSession';
import { sessionUserId } from '../../application/domain/entities/AuthSession';
import type { AuthRepository, LoginCredentials } from '../../application/ports/AuthRepository';
import type { SessionStore } from '../../application/ports/SessionStore';

export interface AuthProviderProps {
  readonly authRepository: AuthRepository;
  readonly sessionStore: SessionStore;
  readonly tokenHolder: SessionTokenHolder;
  readonly unauthorizedNotifier: UnauthorizedNotifier;
  /** Called after a successful sign-in, so the sync engine can drain the outbox. */
  readonly onAuthenticated?: (userId: string) => void;
}

/**
 * The one genuinely stateful provider in the app.
 *
 * Everything else is constructed once at boot and lives in AppDIContext; a session
 * changes over time, so it earns a real provider rather than a slot in a DI bag.
 */
export function AuthProvider({
  authRepository,
  sessionStore,
  tokenHolder,
  unauthorizedNotifier,
  onAuthenticated,
  children,
}: PropsWithChildren<AuthProviderProps>) {
  const [session, setSession] = useState<AuthSession>({ status: 'loading' });

  // A ref so the restore effect does not take `onAuthenticated` as a dependency (an
  // inline callback from the caller would otherwise re-run session restoration on every
  // render). Updated in a layout effect rather than during render: writing a ref while
  // rendering is unsafe under concurrent rendering, and useLayoutEffect is guaranteed to
  // run before the restore effect below.
  const onAuthenticatedRef = useRef(onAuthenticated);
  useLayoutEffect(() => {
    onAuthenticatedRef.current = onAuthenticated;
  }, [onAuthenticated]);

  const applyAuthenticated = useCallback(
    (next: Extract<AuthSession, { status: 'authenticated' }>) => {
      tokenHolder.setAccessToken(next.accessToken);
      sessionStore.write({
        user: next.user,
        accessToken: next.accessToken,
        expiresAt: next.expiresAt,
      });
      setSession(next);
      onAuthenticatedRef.current?.(next.user.id);
    },
    [sessionStore, tokenHolder],
  );

  // --- Restore on boot ------------------------------------------------------
  useEffect(() => {
    let isCurrent = true;

    const restore = async (): Promise<void> => {
      const persisted = sessionStore.read();
      if (!persisted) {
        setSession({ status: 'anonymous' });
        return;
      }

      // Locally-known expiry first: no point spending a request (or waiting for a
      // timeout while offline) on a token we can already see is stale.
      if (persisted.expiresAt <= Date.now()) {
        tokenHolder.setAccessToken(null);
        setSession({ status: 'expired', user: persisted.user });
        return;
      }

      // Optimistically restore so the app is usable offline immediately...
      tokenHolder.setAccessToken(persisted.accessToken);
      setSession({
        status: 'authenticated',
        user: persisted.user,
        accessToken: persisted.accessToken,
        expiresAt: persisted.expiresAt,
      });
      onAuthenticatedRef.current?.(persisted.user.id);

      // ...then revalidate. This is what refreshes role and plantId, which the
      // backend deliberately keeps out of the JWT claims.
      try {
        const user = await authRepository.fetchCurrentUser();
        if (!isCurrent) {
          return;
        }
        applyAuthenticated({
          status: 'authenticated',
          user,
          accessToken: persisted.accessToken,
          expiresAt: persisted.expiresAt,
        });
      } catch (error) {
        if (!isCurrent) {
          return;
        }
        // Only a definitive rejection ends the session. A network failure must NOT:
        // being offline is the normal case this app is built for, and wiping the
        // session there would lock the user out of their own unsynced outbox.
        if (isApiError(error) && error.httpStatus === 401) {
          tokenHolder.setAccessToken(null);
          setSession({ status: 'expired', user: persisted.user });
        }
      }
    };

    void restore();
    return () => {
      isCurrent = false;
    };
  }, [applyAuthenticated, authRepository, sessionStore, tokenHolder]);

  // --- React to a 401 raised anywhere in the app ----------------------------
  useEffect(
    () =>
      unauthorizedNotifier.subscribe(() => {
        tokenHolder.setAccessToken(null);
        setSession((previous) =>
          previous.status === 'authenticated'
            ? { status: 'expired', user: previous.user }
            : previous,
        );
      }),
    [tokenHolder, unauthorizedNotifier],
  );

  const login = useCallback(
    async (credentials: LoginCredentials): Promise<void> => {
      const result = await authRepository.login(credentials);
      applyAuthenticated({
        status: 'authenticated',
        user: result.user,
        accessToken: result.accessToken,
        expiresAt: Date.now() + result.expiresInSeconds * 1000,
      });
    },
    [applyAuthenticated, authRepository],
  );

  const logout = useCallback((): void => {
    tokenHolder.setAccessToken(null);
    sessionStore.clear();
    setSession({ status: 'anonymous' });
  }, [sessionStore, tokenHolder]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      userId: sessionUserId(session),
      login,
      logout,
      reauthenticate: login,
    }),
    [login, logout, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
