import { Link } from 'react-router';
import { inspectionDetailPath, inspectionResolvePath } from '@/app/route-paths';
import { formatRelativeDate, formatSyncLag } from '@/shared/lib/datetime';
import { Card } from '@/shared/ui/feedback';
import { SyncStateChip } from '@/shared/offline/infra/ui/components/SyncStateChip';
import { DEFECT_TYPE_LABELS } from '../../../application/domain/DefectType';
import { InspectionStatus } from '../../../application/domain/InspectionStatus';
import { SEVERITY_ACCENT_CLASSES } from '../../../application/domain/Severity';
import type { InspectionListRow } from '../../../application/domain/entities/InspectionListRow';
import { SeverityBadge } from './SeverityBadge';
import { StatusBadge } from './StatusBadge';

export interface InspectionCardProps {
  readonly row: InspectionListRow;
  /** Only true for a QA manager; a supervisor never sees a resolve affordance. */
  readonly canResolve: boolean;
  /** Plant code is noise for a single-plant supervisor. */
  readonly showsPlant: boolean;
}

export function InspectionCard({ row, canResolve, showsPlant }: InspectionCardProps) {
  // A local row has no server id, and the resolve route needs one -- so the type
  // system, not a runtime check, is what prevents a resolve action appearing here.
  if (row.source === 'local') {
    const { draft } = row;
    return (
      <Card accentClassName={SEVERITY_ACCENT_CLASSES[draft.severity]} className="p-3 pl-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <SeverityBadge severity={draft.severity} />
          <SyncStateChip state={row.syncState} />
        </div>
        <p className="mt-2 text-base font-semibold text-text">{draft.machineLineId}</p>
        <p className="text-sm text-text-muted">
          {DEFECT_TYPE_LABELS[draft.defectType]}
        </p>
        {draft.remarks ? (
          <p className="mt-1 line-clamp-2 text-sm text-text-muted">{draft.remarks}</p>
        ) : null}
        <p className="mt-2 text-xs text-text-muted">
          {formatRelativeDate(draft.inspectionDate)}
        </p>
        {row.lastError ? (
          <p className="mt-2 rounded-control bg-danger-bg px-2 py-1.5 text-xs font-medium text-danger">
            {row.lastError.message}
          </p>
        ) : null}
      </Card>
    );
  }

  const { inspection } = row;
  const syncLag = formatSyncLag(inspection.syncLagSeconds);

  return (
    <Card
      accentClassName={SEVERITY_ACCENT_CLASSES[inspection.severity]}
      className="p-3 pl-4"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <SeverityBadge severity={inspection.severity} />
        <StatusBadge status={inspection.status} />
        {syncLag ? (
          <span className="text-xs text-text-muted">{syncLag}</span>
        ) : null}
      </div>

      {/* The whole card is the tap target through to the detail view. */}
      <Link to={inspectionDetailPath(inspection.id)} className="mt-2 block">
        <p className="text-base font-semibold text-text">{inspection.machineLineId}</p>
        <p className="text-sm text-text-muted">
          {DEFECT_TYPE_LABELS[inspection.defectType]}
        </p>
        {inspection.remarks ? (
          <p className="mt-1 line-clamp-2 text-sm text-text-muted">
            {inspection.remarks}
          </p>
        ) : null}
        <p className="mt-2 text-xs text-text-muted">
          {formatRelativeDate(inspection.inspectionDate)}
          {showsPlant && inspection.plant ? ` · ${inspection.plant.code}` : ''}
          {inspection.loggedBy ? ` · ${inspection.loggedBy.fullName}` : ''}
        </p>
      </Link>

      {canResolve && inspection.status === InspectionStatus.Open ? (
        <div className="mt-3 flex justify-end">
          <Link
            to={inspectionResolvePath(inspection.id)}
            className="inline-flex min-h-12 items-center rounded-control bg-accent px-4 text-sm font-medium text-accent-fg"
          >
            Resolve
          </Link>
        </div>
      ) : null}
    </Card>
  );
}
