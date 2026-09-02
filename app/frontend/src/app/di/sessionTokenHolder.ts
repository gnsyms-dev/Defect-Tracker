import type { AuthTokenProvider } from '@/shared/api/AuthTokenProvider';

/**
 * Breaks the dependency cycle between the HTTP client and the auth feature.
 *
 * FetchHttpClient needs a token; the auth repository that obtains the token needs the
 * HTTP client. A mutable holder created before both, implementing AuthTokenProvider,
 * lets the client be constructed first and lets AuthProvider push the token in later.
 *
 * The alternative -- importing the auth store from shared/api -- would make the shared
 * layer depend on a feature and invert the layering the architecture is built on.
 */
export class SessionTokenHolder implements AuthTokenProvider {
  private accessToken: string | null = null;

  getAccessToken(): string | null {
    return this.accessToken;
  }

  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }
}

/**
 * A tiny event channel for "the server rejected our token".
 *
 * The HTTP client raises it and never touches the router; the auth provider listens
 * and flips the session to `expired`. Keeping the client router-agnostic is what
 * allows a re-login prompt OVER the current screen rather than a hard redirect that
 * would discard a half-filled form during a background flush.
 */
export class UnauthorizedNotifier {
  private readonly listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify = (): void => {
    for (const listener of this.listeners) {
      listener();
    }
  };
}
