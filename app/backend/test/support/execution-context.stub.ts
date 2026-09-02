import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * A minimal ExecutionContext for guard unit tests.
 *
 * Hand-rolled rather than built with @nestjs/testing because the whole Nest 12
 * stack ships as ESM-only, which Jest's CommonJS module registry cannot require.
 * See the note at the top of any *.spec.ts for the full reasoning -- the short
 * version is that constructor-injected classes need no DI container to unit test.
 */
export interface ExecutionContextStubOptions {
  readonly headers?: Record<string, string>;
  readonly user?: unknown;
  readonly handler?: () => void;
  readonly controller?: new () => unknown;
}

export function createExecutionContextStub(
  options: ExecutionContextStubOptions = {},
): { context: ExecutionContext; request: Request & { user?: unknown } } {
  const request = {
    headers: options.headers ?? {},
    user: options.user,
    method: 'GET',
    originalUrl: '/api/v1/test',
  } as unknown as Request & { user?: unknown };

  const handler = options.handler ?? function testHandler(): void {};
  const controller = options.controller ?? class TestController {};

  const context = {
    switchToHttp: () => ({
      getRequest: <T>(): T => request as unknown as T,
      getResponse: <T>(): T => ({}) as T,
      getNext: <T>(): T => ({}) as T,
    }),
    getHandler: () => handler,
    getClass: () => controller,
    getType: () => 'http',
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => ({}),
    switchToWs: () => ({}),
  } as unknown as ExecutionContext;

  return { context, request };
}
