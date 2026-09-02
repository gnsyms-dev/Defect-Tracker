import type { DefectType } from '../DefectType';
import type { Severity } from '../Severity';

/**
 * An inspection as the supervisor entered it, before the server has seen it.
 *
 * This -- not the wire DTO -- is what the outbox stores. Three reasons, and the first
 * is the decisive one:
 *
 *  1. The merged list RENDERS pending rows. Storing a DTO would force a DTO -> domain
 *     mapping in the render path, which is exactly the Domain-First violation the
 *     architecture exists to prevent.
 *  2. Mapping at flush time means an entry queued by app v1 still POSTs correctly
 *     after the request shape changes in v2. A frozen DTO would be wrong forever.
 *  3. It keeps the API shape confined to infra/dto, where it belongs.
 */
export interface DraftInspection {
  readonly clientUuid: string;
  readonly inspectionDate: string;
  readonly machineLineId: string;
  readonly defectType: DefectType;
  readonly severity: Severity;
  readonly remarks: string | null;
  /** Captured on the device at submit time, with an explicit UTC offset. */
  readonly loggedAt: string;
}
