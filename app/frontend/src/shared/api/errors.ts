/**
 * The transport failed: the request never reached the server, or its answer never
 * reached us.
 *
 * This is THE distinction the entire offline layer keys off. `fetch` rejects only
 * for network-level failure, a CORS rejection, or an abort -- never for a non-2xx
 * status. So a NetworkError means "retry this later", while an ApiError with a 4xx
 * means "this payload will never become valid, stop retrying".
 *
 * Caveat worth knowing: a CORS rejection is also a TypeError and is
 * indistinguishable from being offline. That is one of the reasons this app talks to
 * the API same-origin through Vite's dev proxy rather than via an absolute URL.
 */
export class NetworkError extends Error {
  readonly kind = 'network';

  constructor(message = 'Network request failed', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'NetworkError';
  }
}

export type ApiErrorKind =
  /** A response arrived and reported failure (status:false, or a non-2xx). */
  | 'http'
  /** A response arrived but was not the JSON envelope (proxy HTML, 502 page, ...). */
  | 'malformed'
  /** The envelope parsed but `data` did not match the expected schema -- our bug. */
  | 'contract';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly httpStatus: number | null;
  /** The backend's ResponseCode, e.g. '4010'. Null when we never got an envelope. */
  readonly responseCode: string | null;

  constructor(params: {
    kind: ApiErrorKind;
    message: string;
    httpStatus?: number | null;
    responseCode?: string | null;
    cause?: unknown;
  }) {
    super(params.message, { cause: params.cause });
    this.name = 'ApiError';
    this.kind = params.kind;
    this.httpStatus = params.httpStatus ?? null;
    this.responseCode = params.responseCode ?? null;
  }
}

// Guards rather than bare instanceof at call sites: `catch` binds `unknown`, and the
// project's standards require narrowing rather than casting.
export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** A message safe to show a user, for any thrown value. */
export function toUserMessage(error: unknown): string {
  if (isNetworkError(error)) {
    return "You're offline. This will be retried when you're back online.";
  }
  if (isApiError(error)) {
    return error.kind === 'http'
      ? error.message
      : 'Something went wrong talking to the server. Please try again.';
  }
  return 'Something went wrong. Please try again.';
}
