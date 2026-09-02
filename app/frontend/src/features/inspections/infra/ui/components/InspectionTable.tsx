import { Link } from 'react-router';
import { inspectionDetailPath, inspectionResolvePath } from '@/app/route-paths';
import { formatCalendarDate, formatSyncLag } from '@/shared/lib/datetime';
import { SyncStateChip } from '@/shared/offline/infra/ui/components/SyncStateChip';
import { DEFECT_TYPE_LABELS } from '../../../application/domain/DefectType';
import { InspectionStatus } from '../../../application/domain/InspectionStatus';
import type { InspectionListRow } from '../../../application/domain/entities/InspectionListRow';
import { rowKey } from '../../../application/domain/entities/InspectionListRow';
import { SeverityBadge } from './SeverityBadge';
import { StatusBadge } from './StatusBadge';

export interface InspectionTableProps {
  readonly rows: readonly InspectionListRow[];
  readonly canResolve: boolean;
  readonly showsPlant: boolean;
}

/**
 * The >=768px presentation. Rendered INSTEAD of the card list, chosen by a media query
 * in the page -- not by CSS-hiding both, which would double the DOM and make a screen
 * reader announce every row twice.
 */
export function InspectionTable({ rows, canResolve, showsPlant }: InspectionTableProps) {
  return (
    // Wrapped so a wide table scrolls inside its own container rather than making the
    // page body scroll sideways.
    <div className="overflow-x-auto px-4">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-text-muted">
            <Th>Date</Th>
            {showsPlant ? <Th>Plant</Th> : null}
            <Th>Machine / Line</Th>
            <Th>Defect</Th>
            <Th>Severity</Th>
            <Th>Status</Th>
            <Th>Remarks</Th>
            <Th>{canResolve ? 'Action' : ''}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            if (row.source === 'local') {
              const { draft } = row;
              return (
                <tr key={rowKey(row)} className="border-b border-border/60 bg-pending-bg/30">
                  <Td>{formatCalendarDate(draft.inspectionDate)}</Td>
                  {showsPlant ? <Td>—</Td> : null}
                  <Td className="font-medium">{draft.machineLineId}</Td>
                  <Td>{DEFECT_TYPE_LABELS[draft.defectType]}</Td>
                  <Td>
                    <SeverityBadge severity={draft.severity} />
                  </Td>
                  <Td>
                    <SyncStateChip state={row.syncState} />
                  </Td>
                  <Td className="max-w-64 truncate">{draft.remarks ?? '—'}</Td>
                  <Td />
                </tr>
              );
            }

            const { inspection } = row;
            const lag = formatSyncLag(inspection.syncLagSeconds);
            return (
              <tr key={rowKey(row)} className="border-b border-border/60">
                <Td>
                  {formatCalendarDate(inspection.inspectionDate)}
                  {lag ? (
                    <span className="block text-xs text-text-muted">{lag}</span>
                  ) : null}
                </Td>
                {showsPlant ? <Td>{inspection.plant?.code ?? '—'}</Td> : null}
                <Td className="font-medium">
                  <Link
                    to={inspectionDetailPath(inspection.id)}
                    className="underline underline-offset-2"
                  >
                    {inspection.machineLineId}
                  </Link>
                </Td>
                <Td>{DEFECT_TYPE_LABELS[inspection.defectType]}</Td>
                <Td>
                  <SeverityBadge severity={inspection.severity} />
                </Td>
                <Td>
                  <StatusBadge status={inspection.status} />
                </Td>
                <Td className="max-w-64 truncate">{inspection.remarks ?? '—'}</Td>
                <Td>
                  {canResolve && inspection.status === InspectionStatus.Open ? (
                    <Link
                      to={inspectionResolvePath(inspection.id)}
                      className="inline-flex min-h-tap items-center rounded-control bg-accent px-3 text-xs font-medium text-accent-fg"
                    >
                      Resolve
                    </Link>
                  ) : null}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { readonly children?: React.ReactNode }) {
  return <th scope="col" className="px-2 py-2 font-medium">{children}</th>;
}

function Td({
  children,
  className,
}: {
  readonly children?: React.ReactNode;
  readonly className?: string;
}) {
  return <td className={`px-2 py-3 align-top ${className ?? ''}`}>{children}</td>;
}
