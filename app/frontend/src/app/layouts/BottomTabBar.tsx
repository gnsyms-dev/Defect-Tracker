import { NavLink } from 'react-router';
import { cn } from '@/shared/lib/cn';
import { UserRole } from '@/features/auth/application/domain/UserRole';
import { useSyncStatus } from '@/shared/offline/infra/ui/useSyncStatus';
import { RoutePath } from '../route-paths';

interface TabDefinition {
  readonly to: string;
  readonly label: string;
  readonly icon: string;
  readonly showsPendingBadge?: boolean;
}

/**
 * A fixed BOTTOM tab bar, not a hamburger.
 *
 * Three reasons, all specific to this user: the top-left corner of a 390x844 phone is
 * the hardest point to reach one-handed and the supervisor's other hand is on a fabric
 * roll; a hamburger buries the primary action behind a tap plus a read; and gloved
 * hands need large, always-visible, spatially STABLE targets that build muscle memory.
 *
 * The two roles get genuinely different tab sets, so neither ever sees a control it
 * cannot use.
 */
const SUPERVISOR_TABS: readonly TabDefinition[] = [
  { to: RoutePath.Log, label: 'Log', icon: '＋' },
  {
    to: RoutePath.Inspections,
    label: 'My Logs',
    icon: '☰',
    showsPendingBadge: true,
  },
  { to: RoutePath.Summary, label: 'Summary', icon: '▦' },
  { to: RoutePath.Account, label: 'Account', icon: '☺' },
];

const QA_TABS: readonly TabDefinition[] = [
  { to: RoutePath.Inspections, label: 'Inspections', icon: '☰' },
  { to: RoutePath.Summary, label: 'Summary', icon: '▦' },
  { to: RoutePath.Account, label: 'Account', icon: '☺' },
];

export interface BottomTabBarProps {
  readonly role: UserRole;
}

export function BottomTabBar({ role }: BottomTabBarProps) {
  const { counts } = useSyncStatus();
  const tabs = role === UserRole.Supervisor ? SUPERVISOR_TABS : QA_TABS;
  const pendingCount = counts.pending + counts.syncing + counts.failed;

  return (
    <nav
      aria-label="Main"
      // pb-[env(safe-area-inset-bottom)] needs viewport-fit=cover in index.html, or
      // the inset resolves to 0 and this sits under the iPhone home indicator.
      className={cn(
        'sticky bottom-0 z-30 shrink-0 border-t border-border bg-surface',
        'pb-[env(safe-area-inset-bottom)]',
      )}
    >
      <ul
        className="grid"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((tab) => (
          <li key={tab.to}>
            <NavLink
              to={tab.to}
              end={tab.to === RoutePath.Inspections}
              className={({ isActive }) =>
                cn(
                  // 56px tall with a 44px+ target inside.
                  'relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2',
                  'text-[11px] font-medium',
                  isActive ? 'text-accent' : 'text-text-muted',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span aria-hidden="true" className="text-lg leading-none">
                    {tab.icon}
                  </span>
                  <span>{tab.label}</span>
                  {tab.showsPendingBadge && pendingCount > 0 ? (
                    <span
                      className={cn(
                        'absolute top-1.5 right-[22%] min-w-4 rounded-full px-1',
                        'text-[10px] leading-4 font-bold text-white',
                        counts.failed > 0 ? 'bg-danger' : 'bg-pending',
                      )}
                    >
                      {pendingCount}
                    </span>
                  ) : null}
                  {isActive ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-accent"
                    />
                  ) : null}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
