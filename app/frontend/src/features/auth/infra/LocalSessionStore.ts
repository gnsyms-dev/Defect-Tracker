import { authenticatedUserDtoSchema } from './dto/AuthDto';
import { AuthMapper } from './dto/AuthMapper';
import type {
  PersistedSession,
  SessionStore,
} from '../application/ports/SessionStore';
import { z } from 'zod';

const STORAGE_KEY = 'defect-tracker.auth.session';

const persistedSessionSchema = z.object({
  user: authenticatedUserDtoSchema,
  accessToken: z.string(),
  expiresAt: z.number(),
});

/**
 * The session lives in localStorage, and this is a genuine trade rather than an
 * oversight.
 *
 * sessionStorage would be the better default on a shared device -- but it makes the
 * app FAIL AT ITS CORE PURPOSE: reopen the app offline, the token is gone, signing in
 * requires the network, and the supervisor cannot reach their own unsynced outbox.
 * So: localStorage, plus (a) an expiry check on boot, (b) an offline grace mode where
 * an expired token still grants read access to local data behind a banner rather than
 * a wipe, and (c) the signed-in user's name always visible in the header.
 *
 * The honest cost: a localStorage JWT is exfiltratable by any XSS, and httpOnly
 * cookies are not available here because CORS_CREDENTIALS is false on the API.
 * Mitigations in scope are React's default escaping, no dangerouslySetInnerHTML
 * anywhere, and a bounded 12-hour token. Serving the app same-origin (which the dev
 * proxy already does) is what would make httpOnly cookies viable as a v2 hardening.
 */
export class LocalSessionStore implements SessionStore {
  read(): PersistedSession | null {
    const raw = LocalSessionStore.readRaw();
    if (!raw) {
      return null;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      this.clear();
      return null;
    }

    // Validated, not asserted: this was written by a possibly older build.
    const parsed = persistedSessionSchema.safeParse(parsedJson);
    if (!parsed.success) {
      this.clear();
      return null;
    }

    return {
      user: AuthMapper.toDomain(parsed.data.user),
      accessToken: parsed.data.accessToken,
      expiresAt: parsed.data.expiresAt,
    };
  }

  /** Reading storage can THROW (private mode, blocked site data), not just return null. */
  private static readRaw(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  write(session: PersistedSession): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // A failure here degrades the app to session-only, which is survivable.
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignored deliberately.
    }
  }
}
