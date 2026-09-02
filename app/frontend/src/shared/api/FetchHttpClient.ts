import type { z } from 'zod';
import type { AuthTokenProvider } from './AuthTokenProvider';
import { envelopeSchema, ResponseCode } from './api-envelope';
import { ApiError, NetworkError } from './errors';
import type { HttpClient, HttpRequest, HttpResult } from './HttpClient';
import { canonicalQuery } from './query-string';

const DEFAULT_TIMEOUT_MS = 15_000;

export interface FetchHttpClientOptions {
  readonly baseUrl: string;
  readonly tokenProvider: AuthTokenProvider;
  /** Called on a 401 before the error is thrown. Wired to the session store. */
  readonly onUnauthorized: () => void;
  /** Injected in tests. */
  readonly fetchImpl?: typeof fetch;
}

export class FetchHttpClient implements HttpClient {
  private readonly baseUrl: string;
  private readonly tokenProvider: AuthTokenProvider;
  private readonly onUnauthorized: () => void;
  private readonly fetchImpl: typeof fetch;

  // Explicit field assignment rather than constructor parameter properties:
  // tsconfig sets erasableSyntaxOnly, which bans them on the frontend.
  constructor(options: FetchHttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.tokenProvider = options.tokenProvider;
    this.onUnauthorized = options.onUnauthorized;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async request<T>(req: HttpRequest, dataSchema: z.ZodType<T>): Promise<T> {
    const result = await this.requestWithMeta(req, dataSchema);
    return result.data;
  }

  async requestWithMeta<T>(
    req: HttpRequest,
    dataSchema: z.ZodType<T>,
  ): Promise<HttpResult<T>> {
    const response = await this.send(req);
    const payload = await this.readJson(response);
    return this.unwrap(response, payload, dataSchema);
  }

  private buildUrl(req: HttpRequest): string {
    const query = canonicalQuery(req.query);
    return `${this.baseUrl}${req.path}${query ? `?${query}` : ''}`;
  }

  private async send(req: HttpRequest): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (req.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (req.isAuthRequired !== false) {
      const token = this.tokenProvider.getAccessToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }

    // A timeout, not just the caller's signal. On a bad shop-floor connection a hung
    // fetch is indistinguishable from being offline; converting it into an abort
    // means the outbox retry path handles it instead of the UI spinning forever.
    const timeout = AbortSignal.timeout(req.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const signal = req.signal
      ? AbortSignal.any([req.signal, timeout])
      : timeout;

    try {
      return await this.fetchImpl(this.buildUrl(req), {
        method: req.method ?? 'GET',
        headers,
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
        signal,
      });
    } catch (err) {
      // fetch rejects ONLY for network-level failure, a CORS rejection, or an abort
      // -- never for a non-2xx status. So everything here is genuinely "the request
      // did not complete", which is exactly what the outbox should retry.
      throw new NetworkError(
        err instanceof Error && err.name === 'TimeoutError'
          ? 'The request timed out'
          : 'Network request failed',
        { cause: err },
      );
    }
  }

  private async readJson(response: Response): Promise<unknown> {
    // 204 and friends legitimately have no body.
    if (response.status === 204 || response.headers.get('Content-Length') === '0') {
      return undefined;
    }
    try {
      return (await response.json()) as unknown;
    } catch (err) {
      // A response DID arrive, it just was not our envelope -- a proxy's HTML 502
      // page, or the dev server returning index.html for a mistyped path. This is
      // NOT a NetworkError: we reached something, so retrying forever is wrong.
      throw new ApiError({
        kind: 'malformed',
        message: 'The server returned an unreadable response.',
        httpStatus: response.status,
        cause: err,
      });
    }
  }

  private unwrap<T>(
    response: Response,
    payload: unknown,
    dataSchema: z.ZodType<T>,
  ): HttpResult<T> {
    const parsed = envelopeSchema(dataSchema).safeParse(payload);

    if (!parsed.success) {
      // Distinguish "the server told us it failed" from "the server's success
      // payload did not match what we expect".
      const envelope = looseEnvelope(payload);

      if (envelope && (!envelope.status || !response.ok)) {
        return this.fail(response, envelope.code, envelope.message);
      }

      // Envelope shape was fine but `data` did not validate: that is OUR bug, not
      // the user's. It must be surfaced loudly and must NEVER dead-letter an outbox
      // item.
      throw new ApiError({
        kind: 'contract',
        message: 'The server response did not match the expected shape.',
        httpStatus: response.status,
        responseCode: envelope?.code ?? null,
        cause: parsed.error,
      });
    }

    const envelope = parsed.data;

    if (!envelope.status || !response.ok) {
      return this.fail(response, envelope.code, envelope.message);
    }

    if (envelope.data === undefined) {
      const emptyCheck = dataSchema.safeParse(undefined);
      if (!emptyCheck.success) {
        throw new ApiError({
          kind: 'contract',
          message: 'The server returned no data where data was expected.',
          httpStatus: response.status,
          responseCode: envelope.code,
        });
      }
      return {
        data: emptyCheck.data,
        httpStatus: response.status,
        responseCode: envelope.code,
        message: envelope.message,
      };
    }

    return {
      data: envelope.data,
      httpStatus: response.status,
      responseCode: envelope.code,
      message: envelope.message,
    };
  }

  private fail(response: Response, code: string, message: string): never {
    if (response.status === 401 || code === ResponseCode.Unauthorized) {
      // The client never touches the router: it flips the session store, and the
      // route guard reacts. That keeps this class router-agnostic, and lets the auth
      // layer show a re-login prompt over the current screen instead of a hard
      // redirect that would discard a half-filled form mid-flush.
      this.onUnauthorized();
    }

    throw new ApiError({
      kind: 'http',
      // Displayed verbatim. Never parsed for field names: the backend's
      // GlobalExceptionFilter comma-joins class-validator messages into a single
      // string, so per-field mapping is not recoverable from it -- which is why
      // client-side zod validation carries the whole field-level UX.
      message,
      httpStatus: response.status,
      responseCode: code,
    });
  }
}

/** Reads code/message/status off a payload that failed strict envelope validation. */
function looseEnvelope(
  payload: unknown,
): { status: boolean; code: string; message: string } | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (
    typeof record.code !== 'string' ||
    typeof record.message !== 'string' ||
    typeof record.status !== 'boolean'
  ) {
    return null;
  }
  return { status: record.status, code: record.code, message: record.message };
}
