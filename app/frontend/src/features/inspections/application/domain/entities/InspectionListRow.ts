import type { OutboxError, OutboxStatus } from '@/shared/offline/application/domain/OutboxRecord';
import type { DraftInspection } from './DraftInspection';
import type { Inspection } from './Inspection';

/**
 * A row in the merged list: either a real server record, or a locally-queued draft.
 *
 * This union is doing real work, not decoration. Only the `server` variant carries an
 * `id`, and the resolve action requires an `id` -- so "a pending row must not be
 * resolvable" becomes a COMPILE ERROR rather than a runtime guard someone can forget.
 */
export type InspectionListRow =
  | { readonly source: 'server'; readonly inspection: Inspection }
  | {
      readonly source: 'local';
      readonly clientUuid: string;
      readonly draft: DraftInspection;
      readonly syncState: OutboxStatus;
      readonly lastError?: OutboxError;
    };

export function rowKey(row: InspectionListRow): string {
  return row.source === 'server' ? row.inspection.id : row.clientUuid;
}
