import { Outlet } from 'react-router';
import { isAuthenticated } from '@/features/auth/application/domain/entities/AuthSession';
import { useAuth } from '@/features/auth/infra/di/useAuth';
import { SessionExpiredDialog } from '@/features/auth/infra/ui/components/SessionExpiredDialog';
import { FailedSyncBanner } from '@/shared/offline/infra/ui/components/FailedSyncBanner';
import { OfflineBanner } from '@/shared/offline/infra/ui/components/OfflineBanner';
import { AppHeader } from './AppHeader';
import { BottomTabBar } from './BottomTabBar';

export function AppShell() {
  const { session } = useAuth();

  // The route tree only mounts this for authenticated/expired sessions, so a missing
  // user would be a wiring bug rather than a state to render around.
  if (session.status !== 'authenticated' && session.status !== 'expired') {
    return null;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <AppHeader user={session.user} />

      {/* Both banners sit in the layout FLOW, pushing content down rather than
          overlaying it: an overlay would cover the row a supervisor is reading, and
          these conditions persist rather than passing. */}
      <OfflineBanner />
      <FailedSyncBanner />

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      <BottomTabBar role={session.user.role} />

      {/* Rendered OVER the current screen rather than redirecting to /login: a hard
          redirect during a background flush would discard a half-filled form, which
          is exactly the moment data must not be lost. */}
      {!isAuthenticated(session) ? <SessionExpiredDialog /> : null}
    </div>
  );
}
