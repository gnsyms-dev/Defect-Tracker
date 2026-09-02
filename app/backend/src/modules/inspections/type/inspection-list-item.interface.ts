import type { PlantSummary } from '@modules/plants/type/plant-directory.port';
import type { UserSummary } from '@modules/auth/type/user-directory.port';
import { InspectionEntity } from '../domain/entities/inspection.entity';

/**
 * A domain read model: the inspection plus the display names its row needs.
 *
 * The service assembles this by collecting the page's distinct user and plant ids
 * and making ONE batched directory call each, rather than the repository joining
 * across another module's tables. That keeps "the join" out of the controller and
 * out of the persistence adapter's knowledge of other modules.
 */
export interface InspectionListItem {
  readonly inspection: InspectionEntity;
  readonly loggedBy: UserSummary | null;
  readonly resolvedBy: UserSummary | null;
  readonly plant: PlantSummary | null;
}
