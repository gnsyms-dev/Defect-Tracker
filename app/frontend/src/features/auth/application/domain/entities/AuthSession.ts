import type { AuthenticatedUser } from './AuthenticatedUser';

/**
 * A discriminated union rather than `{ user, token, isLoading, isExpired }`.
 *
 * Every consumer must handle the states explicitly, and combinations that make no
 * sense -- an expired session that still carries a usable token, or an authenticated
 * one with no user -- are unrepresentable.
 *
 * `expired` is a distinct state from `anonymous` on purpose: an expired session still
 * knows WHO it belonged to, which is what lets the app show a re-login prompt over
 * the current screen (and keep that user's outbox reachable) instead of wiping
 * everything and bouncing to /login mid-form.
 */
export type AuthSession =
  | { readonly status: 'loading' }
  | { readonly status: 'anonymous' }
  | {
      readonly status: 'authenticated';
      readonly user: AuthenticatedUser;
      readonly accessToken: string;
      readonly expiresAt: number;
    }
  | {
      readonly status: 'expired';
      readonly user: AuthenticatedUser;
    };

export function isAuthenticated(
  session: AuthSession,
): session is Extract<AuthSession, { status: 'authenticated' }> {
  return session.status === 'authenticated';
}

/** The user id whose local data we should be reading, if any. */
export function sessionUserId(session: AuthSession): string | null {
  return session.status === 'authenticated' || session.status === 'expired'
    ? session.user.id
    : null;
}
