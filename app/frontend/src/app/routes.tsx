import { Navigate, type RouteObject } from 'react-router';
import type { AuthSession } from '@/features/auth/application/domain/entities/AuthSession';
import { UserRole } from '@/features/auth/application/domain/UserRole';
import { LoginPage } from '@/features/auth/infra/ui/pages/LoginPage';
import { AccountPage } from '@/features/auth/infra/ui/pages/AccountPage';
import { LogInspectionPage } from '@/features/inspections/infra/ui/pages/LogInspectionPage';
import { InspectionListPage } from '@/features/inspections/infra/ui/pages/InspectionListPage';
import { InspectionFiltersPage } from '@/features/inspections/infra/ui/pages/InspectionFiltersPage';
import { InspectionDetailPage } from '@/features/inspections/infra/ui/pages/InspectionDetailPage';
import { ResolveInspectionPage } from '@/features/inspections/infra/ui/pages/ResolveInspectionPage';
import { SummaryPage } from '@/features/inspections/infra/ui/pages/SummaryPage';
import { PendingQueuePage } from '@/features/inspections/infra/ui/pages/PendingQueuePage';
import { AppShell } from './layouts/AppShell';
import { PublicLayout } from './layouts/PublicLayout';
import { RoutePath } from './route-paths';

/**
 * GENERATES the route table from the session, rather than guarding a fixed one.
 *
 * The difference matters: a guard that renders "Forbidden" is exactly the dead-end
 * screen this app must not have. Here a route a role cannot use simply DOES NOT EXIST,
 * so a stray URL falls through the catch-all and redirects to that role's home.
 *
 * It is also one pure function, which makes the whole per-role navigation model
 * testable without rendering anything.
 */
export function buildRoutes(session: AuthSession): RouteObject[] {
  if (session.status === 'loading') {
    // Nothing to show yet: the session is being restored from storage.
    return [{ path: '*', element: <PublicLayout><p /></PublicLayout> }];
  }

  if (session.status === 'anonymous') {
    return [
      { path: RoutePath.Login, element: <PublicLayout><LoginPage /></PublicLayout> },
      { path: '*', element: <Navigate to={RoutePath.Login} replace /> },
    ];
  }

  // `expired` still knows who the user was, so their local data stays reachable while
  // a re-login prompt sits over the app. Falling back to the anonymous tree would lock
  // them out of their own unsynced outbox.
  const role = session.user.role;
  const home = role === UserRole.Supervisor ? RoutePath.Log : RoutePath.Inspections;

  // Children are declared RELATIVE to the parent's path, and the parent carries
  // path: '/'. React Router v8 does not match absolute child paths under a pathless
  // layout route -- the shell rendered but every Outlet came back empty, which is a
  // silent failure rather than a warning. RoutePath stays absolute for links; only
  // these definitions are relative.
  const shared: RouteObject[] = [
    { path: 'inspections', element: <InspectionListPage /> },
    { path: 'inspections/filters', element: <InspectionFiltersPage /> },
    { path: 'inspections/:id', element: <InspectionDetailPage /> },
    { path: 'summary', element: <SummaryPage /> },
    { path: 'account', element: <AccountPage /> },
  ];

  const supervisorOnly: RouteObject[] = [
    { path: 'log', element: <LogInspectionPage /> },
    // Only a supervisor can create, so only a supervisor can have a queue.
    { path: 'pending', element: <PendingQueuePage /> },
  ];

  const qaOnly: RouteObject[] = [
    { path: 'inspections/:id/resolve', element: <ResolveInspectionPage /> },
  ];

  return [
    {
      path: '/',
      element: <AppShell />,
      children: [
        ...shared,
        ...(role === UserRole.Supervisor ? supervisorOnly : qaOnly),
        { index: true, element: <Navigate to={home} replace /> },
        { path: '*', element: <Navigate to={home} replace /> },
      ],
    },
  ];
}
