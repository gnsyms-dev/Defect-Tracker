import { Link } from 'react-router';
import { roleLabel } from '@/features/auth/application/domain/UserRole';
import type { AuthenticatedUser } from '@/features/auth/application/domain/entities/AuthenticatedUser';
import { RoutePath } from '../route-paths';

export interface AppHeaderProps {
  readonly user: AuthenticatedUser;
}

export function AppHeader({ user }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-border bg-surface">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text">
            {user.plant ? user.plant.code : 'Quality Inspections'}
          </p>
          <p className="truncate text-xs text-text-muted">
            {roleLabel(user.role)} · {user.fullName}
          </p>
        </div>
        {/* The signed-in identity is always visible with a way out: on a shared
            shop-floor phone, "am I still logged in as the last person?" has to be
            answerable at a glance. */}
        <Link
          to={RoutePath.Account}
          className="min-h-tap shrink-0 self-center text-xs font-medium text-text-muted underline underline-offset-2"
        >
          Not you?
        </Link>
      </div>
    </header>
  );
}
