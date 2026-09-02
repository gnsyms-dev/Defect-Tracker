import { Badge } from '@/shared/ui/feedback';
import { OutboxStatus } from '../../../application/domain/OutboxRecord';

export interface SyncStateChipProps {
  readonly state: OutboxStatus;
}

/**
 * The per-row sync indicator.
 *
 * Text always carries the meaning alongside the colour -- colour-blindness plus a
 * dusty screen under plant lighting is a real combination, not a hypothetical.
 */
export function SyncStateChip({ state }: SyncStateChipProps) {
  if (state === OutboxStatus.Failed) {
    return (
      <Badge className="bg-danger-bg text-danger ring-1 ring-danger/30">
        Failed — tap to fix
      </Badge>
    );
  }

  if (state === OutboxStatus.Syncing) {
    return (
      <Badge className="bg-pending-bg text-pending ring-1 ring-pending/30">
        <span
          aria-hidden="true"
          className="size-2 animate-pulse rounded-full bg-current"
        />
        Syncing…
      </Badge>
    );
  }

  return (
    <Badge className="bg-pending-bg text-pending ring-1 ring-pending/30">
      Not synced
    </Badge>
  );
}
