import type { z } from 'zod';
import type { QueryParams } from './query-string';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface HttpRequest {
  /** Path relative to the API base, e.g. '/inspections'. */
  readonly path: string;
  readonly method?: HttpMethod;
  readonly query?: QueryParams;
  readonly body?: unknown;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  /** Defaults to true; set false for the login call. */
  readonly isAuthRequired?: boolean;
}

export interface HttpResult<T> {
  readonly data: T;
  readonly httpStatus: number;
  readonly responseCode: string;
  readonly message: string;
}

export interface HttpClient {
  /**
   * Note the REQUIRED schema parameter.
   *
   * `request<T>(req): Promise<T>` would be an unchecked type assertion wearing a
   * generic's clothing: the runtime value is `unknown` and the caller has merely
   * promised otherwise. Passing the DTO's zod schema makes the generic *earned*, and
   * turns "the backend renamed a field" from `undefined.map is not a function` three
   * layers deep into one clear error at the boundary.
   */
  request<T>(req: HttpRequest, dataSchema: z.ZodType<T>): Promise<T>;

  /** Same, but exposes the HTTP status -- needed to tell a 201 create from a 200 replay. */
  requestWithMeta<T>(
    req: HttpRequest,
    dataSchema: z.ZodType<T>,
  ): Promise<HttpResult<T>>;
}
