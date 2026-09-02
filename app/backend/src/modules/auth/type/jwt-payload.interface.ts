/**
 * Deliberately minimal: `sub`, `email`, and the standard `iat`/`exp`.
 *
 * `role` and `plantId` are NOT claims. They are authorization inputs used to scope
 * every query, so they are read from the database on each request instead:
 *
 *  - It restores the revocation this design gives up by having no refresh token --
 *    setting `is_active = false` takes effect on the very next request. The two
 *    decisions are coupled: the cheap primary-key lookup is what makes an
 *    access-token-only scheme defensible.
 *  - A token minted up to 12 hours ago could carry a stale `plantId`, and acting on
 *    that would leak another plant's data.
 *
 * Given those, including them would make them unused claims -- and an unused claim
 * is one that someone eventually trusts by mistake. The frontend gets `role` from
 * the login response body, not by decoding this.
 */
export interface JwtPayload {
  readonly sub: string;
  readonly email: string;
  readonly iat?: number;
  readonly exp?: number;
}
