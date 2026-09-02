import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from './auth-context';

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    // Throwing lets every consumer treat the value as non-null without a `!`
    // assertion, which the project's TypeScript standards ban.
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return value;
}
