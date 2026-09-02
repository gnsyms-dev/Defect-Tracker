import { Link, useLocation } from 'react-router';
import { RoutePath } from '@/app/route-paths';
import { canResolveInspections, canViewAllPlants } from '@/features/auth/application/domain/UserRole';
import { useAuth } from '@/features/auth/infra/di/useAuth';
import { MD_BREAKPOINT_QUERY, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { StaleDataNotice } from '@/shared/offline/infra/ui/components/StaleDataNotice';
import { Button } from '@/shared/ui/Button';
import { EmptyState, ErrorState, Spinner } from '@/shared/ui/feedback';
import { rowKey } from '../../../application/domain/entities/InspectionListRow';
import {
  InspectionSortField,
  SORT_FIELD_LABELS,
  SortDirection,
} from '../../../application/domain/InspectionStatus';
import { ActiveFilterChips } from '../components/ActiveFilterChips';
import { InspectionCard } from '../components/InspectionCard';
import { InspectionTable } from '../components/InspectionTable';
import { useInspectionListViewModel } from '../view-models/useInspectionListViewModel';

export function InspectionListPage() {
  const vm = useInspectionListViewModel();
  const { session } = useAuth();
  const location = useLocation();
  // Chosen by media query, not CSS-hidden: rendering both would duplicate the DOM and
  // make a screen reader read every row twice.
  const isWide = useMediaQuery(MD_BREAKPOINT_QUERY);

  const role =
    session.status === 'authenticated' || session.status === 'expired'
      ? session.user.role
      : null;
  const canResolve = role ? canResolveInspections(role) : false;
  const showsPlant = role ? canViewAllPlants(role) : false;

  const logResult =
    typeof location.state === 'object' &&
    location.state !== null &&
    'logResult' in location.state
      ? (location.state as { logResult?: string }).logResult
      : undefined;

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
        <div>
          <h1 className="text-lg font-semibold text-text">
            {canResolve ? 'Inspections' : 'My inspections'}
          </h1>
          <p className="text-xs text-text-muted">
            {vm.total === 1 ? '1 inspection' : `${vm.total} inspections`}
            {vm.loadedCount < vm.total ? ` · showing ${vm.loadedCount}` : ''}
          </p>
        </div>
        <Link
          to={RoutePath.InspectionFilters}
          className="inline-flex min-h-tap shrink-0 items-center rounded-control border border-border bg-surface px-3 text-sm font-medium text-text"
        >
          Filters
          {vm.activeFilterCount > 0 ? (
            <span className="ml-1.5 rounded-full bg-accent px-1.5 text-xs text-accent-fg">
              {vm.activeFilterCount}
            </span>
          ) : null}
        </Link>
      </div>

      {/* Honest confirmation: "saved on this device" and "saved" are different facts. */}
      {logResult ? (
        <p
          role="status"
          className={
            logResult === 'queued'
              ? 'mx-4 mb-2 rounded-control bg-pending-bg px-3 py-2 text-sm font-medium text-pending'
              : 'mx-4 mb-2 rounded-control bg-resolved-bg px-3 py-2 text-sm font-medium text-resolved'
          }
        >
          {logResult === 'queued'
            ? 'Saved on this device — it will sync when you’re back online.'
            : 'Inspection saved.'}
        </p>
      ) : null}

      <SortControls
        sortBy={vm.query.sortBy}
        sortDir={vm.query.sortDir}
        onChange={vm.setSort}
      />

      <ActiveFilterChips
        query={vm.query}
        onRemove={vm.removeFilter}
        onClearAll={vm.clearFilters}
      />

      <StaleDataNotice
        fetchedAt={vm.fetchedAt}
        isFromCache={vm.isFromCache}
        onRetry={vm.reload}
      />

      {vm.isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : vm.error && vm.rows.length === 0 ? (
        <ErrorState
          title="Couldn’t load inspections"
          description={vm.error}
          action={
            <Button variant="secondary" onClick={vm.reload}>
              Try again
            </Button>
          }
        />
      ) : vm.rows.length === 0 ? (
        <EmptyState
          title="No inspections yet"
          description={
            vm.activeFilterCount > 0
              ? 'No inspections match these filters.'
              : canResolve
                ? 'Nothing has been logged yet.'
                : 'Log your first defect from the Log tab.'
          }
          action={
            vm.activeFilterCount > 0 ? (
              <Button variant="secondary" onClick={vm.clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : isWide ? (
        <InspectionTable rows={vm.rows} canResolve={canResolve} showsPlant={showsPlant} />
      ) : (
        <ul className="flex flex-col gap-2 px-4">
          {vm.rows.map((row) => (
            <li key={rowKey(row)}>
              <InspectionCard row={row} canResolve={canResolve} showsPlant={showsPlant} />
            </li>
          ))}
        </ul>
      )}

      {vm.hasMore ? (
        <div className="px-4 py-4">
          <Button
            variant="secondary"
            isFullWidth
            isLoading={vm.isRefreshing}
            onClick={vm.loadMore}
          >
            Load more ({vm.loadedCount} of {vm.total})
          </Button>
        </div>
      ) : (
        <div className="h-4" />
      )}
    </div>
  );
}

interface SortControlsProps {
  readonly sortBy: InspectionSortField;
  readonly sortDir: SortDirection;
  readonly onChange: (sortBy: InspectionSortField, sortDir: SortDirection) => void;
}

function SortControls({ sortBy, sortDir, onChange }: SortControlsProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto px-4 pb-2">
      <span className="shrink-0 text-xs text-text-muted">Sort</span>
      {Object.values(InspectionSortField).map((field) => (
        <button
          key={field}
          type="button"
          onClick={() =>
            onChange(
              field,
              // Tapping the active field flips the direction; tapping another switches
              // to it, newest/worst first.
              field === sortBy
                ? sortDir === SortDirection.Desc
                  ? SortDirection.Asc
                  : SortDirection.Desc
                : SortDirection.Desc,
            )
          }
          aria-pressed={field === sortBy}
          className={
            field === sortBy
              ? 'inline-flex min-h-tap shrink-0 items-center gap-1 rounded-full bg-accent px-3 text-xs font-semibold text-accent-fg'
              : 'inline-flex min-h-tap shrink-0 items-center rounded-full border border-border bg-surface px-3 text-xs font-medium text-text-muted'
          }
        >
          {SORT_FIELD_LABELS[field]}
          {field === sortBy ? (
            <span aria-hidden="true">{sortDir === SortDirection.Desc ? '↓' : '↑'}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
