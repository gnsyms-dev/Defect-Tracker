import type { LoadOptions } from '@/shared/api/DataSnapshot';
import type { DraftInspection } from '../domain/entities/DraftInspection';
import type { Inspection } from '../domain/entities/Inspection';
import type {
  InspectionFilters,
  InspectionQuery,
} from '../domain/entities/InspectionFilters';
import type { InspectionPage } from '../domain/entities/InspectionPage';
import type { InspectionSummary } from '../domain/entities/InspectionSummary';

/**
 * What happened when a supervisor pressed Save.
 *
 * A union rather than a boolean, because the two cases need genuinely different words
 * on screen: "Inspection saved." versus "Saved on this device -- will sync when
 * you're back online." Telling the user a bare "Saved" when the entry exists only
 * locally is the one dishonesty that would destroy trust in this tool.
 */
export type LogInspectionOutcome =
  | { readonly kind: 'synced'; readonly inspection: Inspection }
  | { readonly kind: 'queued'; readonly clientUuid: string };

/**
 * Data access for inspections.
 *
 * `create` is the raw write and may throw -- the offline orchestration (write to the
 * outbox first, then attempt a flush) lives in LogInspectionUseCase, because it is
 * orchestration across two collaborators rather than a persistence detail.
 *
 * Read methods accept LoadOptions so a caching implementation can emit a cached
 * snapshot before the network result, without any caller knowing whether caching is
 * happening at all.
 */
export interface InspectionRepository {
  list(
    query: InspectionQuery,
    options?: LoadOptions<InspectionPage>,
  ): Promise<InspectionPage>;

  getById(id: string): Promise<Inspection>;

  create(draft: DraftInspection): Promise<Inspection>;

  resolve(id: string, resolutionNote: string): Promise<Inspection>;

  summary(
    filters: InspectionFilters,
    options?: LoadOptions<InspectionSummary>,
  ): Promise<InspectionSummary>;
}
