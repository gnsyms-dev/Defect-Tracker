import { describe, expect, it } from 'vitest';
import type { RouteObject } from 'react-router';
import type { AuthSession } from '@/features/auth/application/domain/entities/AuthSession';
import { UserRole } from '@/features/auth/application/domain/UserRole';
import { buildRoutes } from './routes';
import { RoutePath } from './route-paths';

function session(role: UserRole): AuthSession {
  return {
    status: 'authenticated',
    accessToken: 'token',
    expiresAt: Date.now() + 3_600_000,
    user: {
      id: 'u1',
      email: 'user@example.com',
      fullName: 'Test User',
      role,
      plantId: 'p1',
      plant: { id: 'p1', code: 'GJ-SUR-01', name: 'Surat Weaving Unit 1' },
    },
  };
}

/**
 * Resolves every declared path against its parent, so assertions are written in terms
 * of the URLs a user actually visits rather than the relative fragments in the tree.
 */
function paths(routes: readonly RouteObject[]): string[] {
  const collected: string[] = [];

  const walk = (list: readonly RouteObject[], parent: string): void => {
    for (const route of list) {
      const resolved = route.path
        ? route.path.startsWith('/')
          ? route.path
          : `${parent.replace(/\/$/, '')}/${route.path}`
        : parent;
      if (route.path) {
        collected.push(resolved);
      }
      if (route.children) {
        walk(route.children, resolved);
      }
    }
  };

  walk(routes, '');
  return collected;
}

describe('buildRoutes', () => {
  it('exposes only the login route when anonymous', () => {
    const declared = paths(buildRoutes({ status: 'anonymous' }));
    expect(declared).toContain(RoutePath.Login);
    expect(declared).not.toContain(RoutePath.Inspections);
  });

  it('gives a SUPERVISOR the log and pending routes', () => {
    const declared = paths(buildRoutes(session(UserRole.Supervisor)));
    expect(declared).toContain(RoutePath.Log);
    expect(declared).toContain(RoutePath.Pending);
    expect(declared).toContain(RoutePath.Inspections);
    expect(declared).toContain(RoutePath.Summary);
  });

  it('does NOT declare the resolve route for a SUPERVISOR', () => {
    // Not "guarded" -- absent. A supervisor typing the URL falls through the
    // catch-all and is redirected, never shown a dead-end "Forbidden" screen.
    const declared = paths(buildRoutes(session(UserRole.Supervisor)));
    expect(declared).not.toContain(RoutePath.InspectionResolve);
  });

  it('gives a QA_MANAGER the resolve route', () => {
    const declared = paths(buildRoutes(session(UserRole.QaManager)));
    expect(declared).toContain(RoutePath.InspectionResolve);
  });

  it('does NOT declare log or pending for a QA_MANAGER, who cannot create', () => {
    const declared = paths(buildRoutes(session(UserRole.QaManager)));
    expect(declared).not.toContain(RoutePath.Log);
    expect(declared).not.toContain(RoutePath.Pending);
  });

  it('always provides a catch-all so an unknown URL cannot render nothing', () => {
    for (const role of [UserRole.Supervisor, UserRole.QaManager]) {
      expect(paths(buildRoutes(session(role)))).toContain('/*');
    }
  });

  it('declares children RELATIVE to the pathed parent', () => {
    // React Router v8 silently fails to match absolute child paths under a PATHLESS
    // layout route -- the shell renders and every Outlet comes back empty, with no
    // warning. This locks in the shape that actually matches.
    const [shell] = buildRoutes(session(UserRole.Supervisor));
    expect(shell.path).toBe('/');
    for (const child of shell.children ?? []) {
      if (child.path && child.path !== '*') {
        expect(child.path.startsWith('/')).toBe(false);
      }
    }
  });

  it('keeps an expired session on the authenticated route tree', () => {
    // Dropping to the anonymous tree would cut the user off from their own unsynced
    // outbox, which is the one thing this app must never do.
    const expired: AuthSession = {
      status: 'expired',
      user: session(UserRole.Supervisor).status === 'authenticated'
        ? { id: 'u1', email: 'e', fullName: 'f', role: UserRole.Supervisor, plantId: 'p1', plant: null }
        : { id: 'u1', email: 'e', fullName: 'f', role: UserRole.Supervisor, plantId: 'p1', plant: null },
    };
    const declared = paths(buildRoutes(expired));
    expect(declared).toContain(RoutePath.Log);
  });
});
