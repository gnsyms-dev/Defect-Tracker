import type { DefectType } from '../DefectType';
import type { InspectionSortField, InspectionStatus, SortDirection } from '../InspectionStatus';
import type { Severity } from '../Severity';

export interface InspectionFilters {
  readonly severity?: readonly Severity[];
  readonly status?: InspectionStatus;
  readonly defectType?: readonly DefectType[];
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly plantId?: string;
  readonly machineLineId?: string;
}

export interface InspectionQuery extends InspectionFilters {
  readonly sortBy: InspectionSortField;
  readonly sortDir: SortDirection;
  readonly page: number;
  readonly limit: number;
}

/** True when any filter (as opposed to sort/paging) is active. */
export function countActiveFilters(filters: InspectionFilters): number {
  let count = 0;
  if (filters.severity && filters.severity.length > 0) count += 1;
  if (filters.status) count += 1;
  if (filters.defectType && filters.defectType.length > 0) count += 1;
  if (filters.dateFrom) count += 1;
  if (filters.dateTo) count += 1;
  if (filters.plantId) count += 1;
  if (filters.machineLineId) count += 1;
  return count;
}
