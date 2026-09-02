/**
 * How the HTTP client obtains a bearer token WITHOUT importing the auth feature.
 *
 * This is dependency inversion doing real work: if `shared/api` imported
 * `features/auth`, the shared layer would depend on a feature and the layering would
 * invert. Instead the auth feature implements this one-method port and the
 * composition root passes it in.
 *
 * One method rather than a whole session object, per Interface Segregation -- the
 * client has no business reading the user's role.
 */
export interface AuthTokenProvider {
  getAccessToken(): string | null;
}
