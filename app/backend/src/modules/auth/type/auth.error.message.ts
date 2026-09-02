export const AuthErrorMessage = {
  // One message for a wrong email, a wrong password, AND a deactivated account.
  // Distinguishing them would turn the login endpoint into a user-enumeration
  // oracle; the service also runs a dummy hash verification on the unknown-email
  // path so response time does not leak account existence either.
  InvalidCredentials: 'Invalid email or password.',
  MissingToken: 'Authentication token is missing.',
  InvalidToken: 'Authentication token is invalid or has expired.',
  AccountUnavailable: 'This account is no longer active.',
} as const;
