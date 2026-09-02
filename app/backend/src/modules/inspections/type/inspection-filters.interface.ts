import {
  DefectType,
  InspectionSortField,
  InspectionStatus,
  Severity,
  SortDirection,
} from './inspection.enum';

export interface InspectionFilters {
  readonly severities?: readonly Severity[];
  readonly status?: InspectionStatus;
  readonly defectTypes?: readonly DefectType[];
  /** Inclusive, `YYYY-MM-DD`. */
  readonly dateFrom?: string;
  /** Inclusive, `YYYY-MM-DD`. */
  readonly dateTo?: string;
  readonly plantId?: string;
  /** Case-insensitive substring match. */
  readonly machineLineId?: string;
}

export interface InspectionSort {
  readonly field: InspectionSortField;
  readonly direction: SortDirection;
}

export interface Pagination {
  readonly page: number;
  readonly limit: number;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
}
