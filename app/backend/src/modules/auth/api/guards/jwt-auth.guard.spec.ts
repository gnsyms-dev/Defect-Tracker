// Instantiated directly rather than via @nestjs/testing -- see the note in
// src/app.controller.spec.ts for why (Nest 12 is ESM-only).
import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@shared/enums/user-role.enum';
import type { AuthenticatedUser } from '@shared/types/authenticated-user.interface';
import { createExecutionContextStub } from '../../../../../test/support/execution-context.stub';
import { AuthService } from '../../domain/services/auth.service';
import type { TokenIssuerPort } from '../../type/token-issuer.port';
import { JwtAuthGuard } from './jwt-auth.guard';

const user: AuthenticatedUser = {
  id: 'u1',
  email: 'supervisor@example.com',
  fullName: 'Rakesh Patel',
  role: UserRole.Supervisor,
  plantId: 'p1',
};

interface Harness {
  readonly guard: JwtAuthGuard;
  readonly tokenIssuer: jest.Mocked<TokenIssuerPort>;
  readonly resolveAuthenticatedUser: jest.Mock;
}

function buildHarness(isPublic: boolean | undefined = undefined): Harness {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(isPublic),
  } as unknown as Reflector;

  const tokenIssuer: jest.Mocked<TokenIssuerPort> = {
    issue: jest.fn(),
    verify: jest.fn(),
  };

  const resolveAuthenticatedUser = jest.fn();
  const authService = { resolveAuthenticatedUser } as unknown as AuthService;

  return {
    guard: new JwtAuthGuard(reflector, authService, tokenIssuer),
    tokenIssuer,
    resolveAuthenticatedUser,
  };
}

describe('JwtAuthGuard', () => {
  it('lets a @Public() route through without touching the token', async () => {
    const { guard, tokenIssuer } = buildHarness(true);
    const { context } = createExecutionContextStub();

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(tokenIssuer.verify).not.toHaveBeenCalled();
  });

  it('rejects a request with no Authorization header', async () => {
    const { guard } = buildHarness();
    const { context } = createExecutionContextStub();
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it.each([
    ['wrong scheme', { authorization: 'Basic abc123' }],
    ['bearer with no value', { authorization: 'Bearer' }],
    ['bearer with blank value', { authorization: 'Bearer    ' }],
  ])(
    'rejects a malformed Authorization header (%s)',
    async (_label, headers) => {
      const { guard } = buildHarness();
      const { context } = createExecutionContextStub({ headers });
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    },
  );

  it('accepts a lower-case "bearer" scheme, which HTTP allows', async () => {
    const { guard, tokenIssuer, resolveAuthenticatedUser } = buildHarness();
    tokenIssuer.verify.mockResolvedValue({ userId: 'u1' });
    resolveAuthenticatedUser.mockResolvedValue(user);

    const { context, request } = createExecutionContextStub({
      headers: { authorization: 'bearer good.token' },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual(user);
  });

  it('rejects a token the issuer cannot verify', async () => {
    const { guard, tokenIssuer, resolveAuthenticatedUser } = buildHarness();
    tokenIssuer.verify.mockResolvedValue(null);

    const { context } = createExecutionContextStub({
      headers: { authorization: 'Bearer tampered.token' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(resolveAuthenticatedUser).not.toHaveBeenCalled();
  });

  it('rejects a STRUCTURALLY VALID token whose user has since been deactivated', async () => {
    // This is the behaviour that buys back revocation despite there being no
    // refresh token: is_active = false takes effect on the very next request.
    const { guard, tokenIssuer, resolveAuthenticatedUser } = buildHarness();
    tokenIssuer.verify.mockResolvedValue({ userId: 'u1' });
    resolveAuthenticatedUser.mockResolvedValue(null);

    const { context, request } = createExecutionContextStub({
      headers: { authorization: 'Bearer valid.but.revoked' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(request.user).toBeUndefined();
  });

  it('resolves role and plantId from the database, not from the token', async () => {
    const { guard, tokenIssuer, resolveAuthenticatedUser } = buildHarness();
    tokenIssuer.verify.mockResolvedValue({ userId: 'u1' });
    resolveAuthenticatedUser.mockResolvedValue({
      ...user,
      role: UserRole.QaManager,
    });

    const { context, request } = createExecutionContextStub({
      headers: { authorization: 'Bearer good.token' },
    });

    await guard.canActivate(context);

    expect(resolveAuthenticatedUser).toHaveBeenCalledWith('u1');
    expect((request.user as AuthenticatedUser).role).toBe(UserRole.QaManager);
  });
});
