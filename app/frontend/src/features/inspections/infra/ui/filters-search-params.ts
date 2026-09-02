import { DefectType } from '../../application/domain/DefectType';
import {
  InspectionSortField,
  InspectionStatus,
  SortDirection,
} from '../../application/domain/InspectionStatus';
import { Severity } from '../../application/domain/Severity';
import type {
  InspectionFilters,
  InspectionQuery,
} from '../../application/domain/entities/InspectionFilters';

export const DEFAULT_LIMIT = 20;

const SEVERITY_VALUES = new Set<string>(Object.values(Severity));
const DEFECT_VALUES = new Set<string>(Object.values(DefectType));
const STATUS_VALUES = new Set<string>(Object.values(InspectionStatus));
const SORT_FIELDS = new Set<string>(Object.values(InspectionSortField));

/**
 * Filters live in the URL, not in component state.
 *
 * Three payoffs: a filtered view survives a refresh and is shareable, the back button
 * behaves, and the cache key derives from the same canonical params -- so the list and
 * its cache entry cannot disagree about what was requested.
 *
 * Everything is validated on the way in: a hand-edited URL must not be able to inject
 * an arbitrary sort column, which is also whitelisted server-side.
 */
export function filtersFromSearchParams(params: URLSearchParams): InspectionQuery {
  const severity = readEnumList(params.get('severity'), SEVERITY_VALUES) as Severity[];
  const defectType = readEnumList(params.get('defectType'), DEFECT_VALUES) as DefectType[];
  const rawStatus = params.get('status');
  const rawSortBy = params.get('sortBy');
  const rawSortDir = params.get('sortDir');
  const page = Number.parseInt(params.get('page') ?? '1', 10);
  const limit = Number.parseInt(params.get('limit') ?? String(DEFAULT_LIMIT), 10);

  return {
    ...(severity.length > 0 ? { severity } : {}),
    ...(defectType.length > 0 ? { defectType } : {}),
    ...(rawStatus && STATUS_VALUES.has(rawStatus)
      ? { status: rawStatus as InspectionStatus }
      : {}),
    ...(isCalendarDate(params.get('dateFrom'))
      ? { dateFrom: params.get('dateFrom') as string }
      : {}),
    ...(isCalendarDate(params.get('dateTo'))
      ? { dateTo: params.get('dateTo') as string }
      : {}),
    ...(params.get('plantId') ? { plantId: params.get('plantId') as string } : {}),
    ...(params.get('machineLineId')
      ? { machineLineId: params.get('machineLineId') as string }
      : {}),
    sortBy:
      rawSortBy && SORT_FIELDS.has(rawSortBy)
        ? (rawSortBy as InspectionSortField)
        : InspectionSortField.InspectionDate,
    sortDir: rawSortDir === SortDirection.Asc ? SortDirection.Asc : SortDirection.Desc,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : DEFAULT_LIMIT,
  };
}

export function searchParamsFromFilters(
  query: Partial<InspectionQuery>,
): URLSearchParams {
  const params = new URLSearchParams();
  if (query.severity?.length) params.set('severity', query.severity.join(','));
  if (query.defectType?.length) params.set('defectType', query.defectType.join(','));
  if (query.status) params.set('status', query.status);
  if (query.dateFrom) params.set('dateFrom', query.dateFrom);
  if (query.dateTo) params.set('dateTo', query.dateTo);
  if (query.plantId) params.set('plantId', query.plantId);
  if (query.machineLineId) params.set('machineLineId', query.machineLineId);
  if (query.sortBy && query.sortBy !== InspectionSortField.InspectionDate) {
    params.set('sortBy', query.sortBy);
  }
  if (query.sortDir && query.sortDir !== SortDirection.Desc) {
    params.set('sortDir', query.sortDir);
  }
  return params;
}

/** Strips sort/paging, leaving just the filter dimensions (what the summary accepts). */
export function toFilters(query: InspectionQuery): InspectionFilters {
  const { severity, defectType, status, dateFrom, dateTo, plantId, machineLineId } =
    query;
  return { severity, defectType, status, dateFrom, dateTo, plantId, machineLineId };
}

function readEnumList(raw: string | null, allowed: ReadonlySet<string>): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => allowed.has(entry));
}

function isCalendarDate(value: string | null): boolean {
  return value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
