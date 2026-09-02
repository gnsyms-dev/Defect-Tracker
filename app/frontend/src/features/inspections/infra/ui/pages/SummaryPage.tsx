import { useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useInspectionDeps } from '@/app/di/useAppDI';
import { RoutePath } from '@/app/route-paths';
import { canViewAllPlants } from '@/features/auth/application/domain/UserRole';
import { useAuth } from '@/features/auth/infra/di/useAuth';
import type { LoadOptions } from '@/shared/api/DataSnapshot';
import { toUserMessage } from '@/shared/api/errors';
import { useAsyncData } from '@/shared/hooks/useAsyncData';
import { MD_BREAKPOINT_QUERY, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { StaleDataNotice } from '@/shared/offline/infra/ui/components/StaleDataNotice';
import { Button } from '@/shared/ui/Button';
import { Card, ErrorState, Spinner } from '@/shared/ui/feedback';
import { InspectionStatus } from '../../../application/domain/InspectionStatus';
import {
  SEVERITY_ACCENT_CLASSES,
  SEVERITY_LABELS,
  type Severity,
} from '../../../application/domain/Severity';
import type { InspectionSummary } from '../../../application/domain/entities/InspectionSummary';
import { filtersFromSearchParams, searchParamsFromFilters, toFilters } from '../filters-search-params';

export function SummaryPage() {
  const { inspectionRepository } = useInspectionDeps();
  const { session } = useAuth();
  const [searchParams] = useSearchParams();
  const isWide = useMediaQuery(MD_BREAKPOINT_QUERY);

  const query = useMemo(() => filtersFromSearchParams(searchParams), [searchParams]);
  const filters = useMemo(() => toFilters(query), [query]);
  const filterKey = searchParamsFromFilters(query).toString();

  const loader = useCallback(
    (options: LoadOptions<InspectionSummary>) =>
      inspectionRepository.summary(filters, options),
    [filters, inspectionRepository],
  );
  const state = useAsyncData<InspectionSummary>(`summary:${filterKey}`, loader);

  const role =
    session.status === 'authenticated' || session.status === 'expired'
      ? session.user.role
      : null;
  const showsPlants = role ? canViewAllPlants(role) : false;

  if (state.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (state.error && !state.data) {
    return (
      <ErrorState
        title="Couldn’t load the summary"
        description={toUserMessage(state.error)}
        action={
          <Button variant="secondary" onClick={state.reload}>
            Try again
          </Button>
        }
      />
    );
  }

  if (!state.data) {
    return null;
  }

  const summary = state.data;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="text-lg font-semibold text-text">Summary</h1>
        <p className="text-xs text-text-muted">
          {showsPlants ? 'All plants' : 'Your inspections'}
        </p>
      </div>

      <StaleDataNotice
        fetchedAt={state.fetchedAt}
        isFromCache={state.isFromCache}
        onRetry={state.reload}
      />

      {/* A hero card for the number that IS the work queue, rather than six equal
          cells that read as six orphan numbers. */}
      <Link to={`${RoutePath.Inspections}?status=${InspectionStatus.Open}`}>
        <Card className="p-4">
          <p className="text-sm font-medium text-text-muted">Open defects</p>
          <p className="mt-1 text-4xl font-semibold tabular-nums text-text">
            {summary.totals.open}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            of {summary.totals.total} logged · {summary.totals.resolved} resolved
          </p>
        </Card>
      </Link>

      {isWide ? (
        <SeverityTable summary={summary} />
      ) : (
        <div className="flex flex-col gap-2">
          {summary.bySeverity.map((entry) => (
            <SeverityCard key={entry.severity} entry={entry} />
          ))}
        </div>
      )}

      {showsPlants && summary.byPlant.length > 0 ? (
        <Card className="divide-y divide-border">
          <p className="px-4 py-2 text-sm font-semibold text-text">By plant</p>
          {summary.byPlant.map((entry) => (
            <Link
              key={entry.plantId}
              to={`${RoutePath.Inspections}?plantId=${entry.plantId}`}
              className="flex items-baseline justify-between gap-3 px-4 py-3"
            >
              <span className="text-sm font-medium text-text">
                {entry.plant?.code ?? 'Unknown'}
              </span>
              <span className="text-sm tabular-nums text-text-muted">
                <span className="font-semibold text-open">{entry.open}</span> open ·{' '}
                {entry.resolved} resolved
              </span>
            </Link>
          ))}
        </Card>
      ) : null}
    </div>
  );
}

interface SeverityEntry {
  readonly severity: Severity;
  readonly open: number;
  readonly resolved: number;
  readonly total: number;
}

/**
 * Every cell links into the filtered list, which turns the summary from a dashboard
 * into the app's primary navigation surface.
 */
function SeverityCard({ entry }: { readonly entry: SeverityEntry }) {
  return (
    <Card accentClassName={SEVERITY_ACCENT_CLASSES[entry.severity]} className="pl-4">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm font-semibold text-text">
          {SEVERITY_LABELS[entry.severity]}
        </p>
        <p className="text-xs text-text-muted tabular-nums">{entry.total} total</p>
      </div>
      <div className="grid grid-cols-2 border-t border-border">
        <Link
          to={`${RoutePath.Inspections}?severity=${entry.severity}&status=${InspectionStatus.Open}`}
          className="border-r border-border px-4 py-3"
        >
          <p className="text-xs text-text-muted">Open</p>
          <p className="text-2xl font-semibold tabular-nums text-open">{entry.open}</p>
        </Link>
        <Link
          to={`${RoutePath.Inspections}?severity=${entry.severity}&status=${InspectionStatus.Resolved}`}
          className="px-4 py-3"
        >
          <p className="text-xs text-text-muted">Resolved</p>
          <p className="text-2xl font-semibold tabular-nums text-resolved">
            {entry.resolved}
          </p>
        </Link>
      </div>
    </Card>
  );
}

function SeverityTable({ summary }: { readonly summary: InspectionSummary }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-text-muted">
            <th scope="col" className="px-3 py-2 font-medium">Severity</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Open</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Resolved</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {summary.bySeverity.map((entry) => (
            <tr key={entry.severity} className="border-b border-border/60">
              <td className="px-3 py-3 font-medium text-text">
                {SEVERITY_LABELS[entry.severity]}
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-open">{entry.open}</td>
              <td className="px-3 py-3 text-right tabular-nums text-resolved">
                {entry.resolved}
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-text">{entry.total}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <td className="px-3 py-3 text-text">All</td>
            <td className="px-3 py-3 text-right tabular-nums text-text">
              {summary.totals.open}
            </td>
            <td className="px-3 py-3 text-right tabular-nums text-text">
              {summary.totals.resolved}
            </td>
            <td className="px-3 py-3 text-right tabular-nums text-text">
              {summary.totals.total}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
