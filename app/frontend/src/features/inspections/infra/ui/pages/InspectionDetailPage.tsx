import { useCallback } from 'react';
import { Link, useParams } from 'react-router';
import { useInspectionDeps } from '@/app/di/useAppDI';
import { inspectionResolvePath, RoutePath } from '@/app/route-paths';
import { canResolveInspections } from '@/features/auth/application/domain/UserRole';
import { useAuth } from '@/features/auth/infra/di/useAuth';
import { toUserMessage } from '@/shared/api/errors';
import { useAsyncData } from '@/shared/hooks/useAsyncData';
import { formatCalendarDate, formatSyncLag, formatTime } from '@/shared/lib/datetime';
import { Button } from '@/shared/ui/Button';
import { Card, ErrorState, Spinner } from '@/shared/ui/feedback';
import { DEFECT_TYPE_LABELS } from '../../../application/domain/DefectType';
import { InspectionStatus } from '../../../application/domain/InspectionStatus';
import type { Inspection } from '../../../application/domain/entities/Inspection';
import { SeverityBadge } from '../components/SeverityBadge';
import { StatusBadge } from '../components/StatusBadge';

export function InspectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { inspectionRepository } = useInspectionDeps();
  const { session } = useAuth();

  const loader = useCallback(
    () => inspectionRepository.getById(id ?? ''),
    [id, inspectionRepository],
  );
  const state = useAsyncData<Inspection>(`inspection:${id ?? ''}`, loader);

  const role =
    session.status === 'authenticated' || session.status === 'expired'
      ? session.user.role
      : null;
  const canResolve = role ? canResolveInspections(role) : false;

  if (state.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (state.error || !state.data) {
    return (
      <ErrorState
        title="Couldn’t load this inspection"
        // The API answers 404 rather than 403 for a row outside the caller's scope, so
        // "not found" is the honest message either way -- and deliberately does not
        // confirm whether it exists.
        description={state.error ? toUserMessage(state.error) : 'Inspection not found.'}
        action={
          <Link to={RoutePath.Inspections}>
            <Button variant="secondary">Back to list</Button>
          </Link>
        }
      />
    );
  }

  const inspection = state.data;
  const lag = formatSyncLag(inspection.syncLagSeconds);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={inspection.severity} />
        <StatusBadge status={inspection.status} />
      </div>

      <div>
        <h1 className="text-xl font-semibold text-text">{inspection.machineLineId}</h1>
        <p className="text-sm text-text-muted">
          {DEFECT_TYPE_LABELS[inspection.defectType]}
        </p>
      </div>

      <Card className="divide-y divide-border">
        <Row label="Inspection date" value={formatCalendarDate(inspection.inspectionDate)} />
        <Row label="Plant" value={inspection.plant ? `${inspection.plant.code} — ${inspection.plant.name}` : '—'} />
        <Row label="Logged by" value={inspection.loggedBy?.fullName ?? '—'} />
        <Row
          label="Logged at"
          value={`${formatTime(inspection.loggedAt)}${lag ? ` · ${lag}` : ''}`}
        />
      </Card>

      {inspection.remarks ? (
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-text">Remarks</h2>
          <p className="mt-1 text-sm whitespace-pre-wrap text-text-muted">
            {inspection.remarks}
          </p>
        </Card>
      ) : null}

      {inspection.status === InspectionStatus.Resolved ? (
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-resolved">Resolution</h2>
          <p className="mt-1 text-sm whitespace-pre-wrap text-text">
            {inspection.resolutionNote}
          </p>
          <p className="mt-2 text-xs text-text-muted">
            {inspection.resolvedBy?.fullName ?? 'Unknown'}
            {inspection.resolvedAt ? ` · ${formatTime(inspection.resolvedAt)}` : ''}
          </p>
        </Card>
      ) : canResolve ? (
        <Link to={inspectionResolvePath(inspection.id)} className="block">
          <Button size="lg" isFullWidth>
            Resolve this inspection
          </Button>
        </Link>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-3">
      <span className="shrink-0 text-sm text-text-muted">{label}</span>
      <span className="text-right text-sm font-medium text-text">{value}</span>
    </div>
  );
}
