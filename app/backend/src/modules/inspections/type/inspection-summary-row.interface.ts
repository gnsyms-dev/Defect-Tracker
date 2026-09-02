import { InspectionStatus, Severity } from './inspection.enum';

/**
 * One raw row from the GROUPING SETS aggregation.
 *
 * A null column means "not part of this grouping set", which is unambiguous only
 * because all three underlying columns are NOT NULL -- with a nullable column you
 * would need GROUPING() to tell a real null apart from an excluded one.
 *
 * Four row shapes come back, one per grouping set:
 *   severity !== null                      -> severity x status breakdown
 *   plantId  !== null                      -> plant x status breakdown
 *   status   !== null, other two null       -> per-status total
 *   all three null                          -> grand total
 *
 * The repository returns these flat; the domain service pivots them and fills
 * zeros, because zero-filling is a rule about the API contract rather than about
 * persistence.
 */
export interface InspectionSummaryRow {
  readonly status: InspectionStatus | null;
  readonly severity: Severity | null;
  readonly plantId: string | null;
  readonly count: number;
}
