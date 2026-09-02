export const TOKEN_ISSUER = Symbol('TOKEN_ISSUER');

export interface IssuedToken {
  readonly accessToken: string;
  readonly expiresInSeconds: number;
}

export interface VerifiedToken {
  /** The user id, from the JWT `sub` claim. */
  readonly userId: string;
}

export interface TokenIssuerPort {
  issue(userId: string, email: string): Promise<IssuedToken>;
  /** Resolves to null for any invalid, expired or malformed token. */
  verify(token: string): Promise<VerifiedToken | null>;
}
