// Instantiated directly rather than via @nestjs/testing -- see the note in
// src/app.controller.spec.ts for why (Nest 12 is ESM-only).
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@shared/enums/user-role.enum';
import type { AuthenticatedUser } from '@shared/types/authenticated-user.interface';
import { createExecutionContextStub } from '../../../test/support/execution-context.stub';
import { RolesGuard } from './roles.guard';

const supervisor: AuthenticatedUser = {
  id: 'u1',
  email: 'supervisor@example.com',
  fullName: 'Rakesh Patel',
  role: UserRole.Supervisor,
  plantId: 'p1',
};
const qaManager: AuthenticatedUser = {
  ...supervisor,
  role: UserRole.QaManager,
};

function buildGuard(
  requiredRoles: readonly UserRole[] | undefined,
): RolesGuard {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('allows any authenticated user when no @Roles() is declared', () => {
    const { context } = createExecutionContextStub({ user: supervisor });
    expect(buildGuard(undefined).canActivate(context)).toBe(true);
  });

  it('treats an empty @Roles() list as "any authenticated user"', () => {
    const { context } = createExecutionContextStub({ user: supervisor });
    expect(buildGuard([]).canActivate(context)).toBe(true);
  });

  it('allows a user whose role is listed', () => {
    const { context } = createExecutionContextStub({ user: qaManager });
    expect(buildGuard([UserRole.QaManager]).canActivate(context)).toBe(true);
  });

  it('forbids a supervisor from a QA_MANAGER-only action (e.g. resolve)', () => {
    const { context } = createExecutionContextStub({ user: supervisor });
    expect(() => buildGuard([UserRole.QaManager]).canActivate(context)).toThrow(
      ForbiddenException,
    );
  });

  it('forbids a QA manager from a SUPERVISOR-only action (e.g. create)', () => {
    const { context } = createExecutionContextStub({ user: qaManager });
    expect(() =>
      buildGuard([UserRole.Supervisor]).canActivate(context),
    ).toThrow(ForbiddenException);
  });

  it('fails loudly when a route declares @Roles() but no user is present', () => {
    // Only reachable if a route carries @Roles() and @Public() together, which is
    // a wiring bug. Allowing it through would silently expose the endpoint.
    const { context } = createExecutionContextStub({ user: undefined });
    expect(() => buildGuard([UserRole.QaManager]).canActivate(context)).toThrow(
      ForbiddenException,
    );
  });
});
