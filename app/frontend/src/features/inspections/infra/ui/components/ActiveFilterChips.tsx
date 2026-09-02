import { formatCalendarDate } from '@/shared/lib/datetime';
import { DEFECT_TYPE_LABELS } from '../../../application/domain/DefectType';
import { STATUS_LABELS } from '../../../application/domain/InspectionStatus';
import { SEVERITY_LABELS } from '../../../application/domain/Severity';
import type { InspectionQuery } from '../../../application/domain/entities/InspectionFilters';

export interface ActiveFilterChipsProps {
  readonly query: InspectionQuery;
  readonly onRemove: (key: keyof InspectionQuery) => void;
  readonly onClearAll: () => void;
}

/**
 * A horizontally scrollable chip row, so the active filter set is always visible
 * without reopening the sheet -- otherwise "why is this list empty?" becomes a
 * guessing game.
 */
export function ActiveFilterChips({
  query,
  onRemove,
  onClearAll,
}: ActiveFilterChipsProps) {
  const chips: { key: keyof InspectionQuery; label: string }[] = [];

  if (query.severity?.length) {
    chips.push({
      key: 'severity',
      label: query.severity.map((value) => SEVERITY_LABELS[value]).join(', '),
    });
  }
  if (query.status) {
    chips.push({ key: 'status', label: STATUS_LABELS[query.status] });
  }
  if (query.defectType?.length) {
    chips.push({
      key: 'defectType',
      label: query.defectType.map((value) => DEFECT_TYPE_LABELS[value]).join(', '),
    });
  }
  if (query.dateFrom) {
    chips.push({ key: 'dateFrom', label: `From ${formatCalendarDate(query.dateFrom)}` });
  }
  if (query.dateTo) {
    chips.push({ key: 'dateTo', label: `To ${formatCalendarDate(query.dateTo)}` });
  }
  if (query.plantId) {
    chips.push({ key: 'plantId', label: 'Plant' });
  }
  if (query.machineLineId) {
    chips.push({ key: 'machineLineId', label: `“${query.machineLineId}”` });
  }

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="flex gap-2 overflow-x-auto px-4 pb-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onRemove(chip.key)}
          className="inline-flex min-h-tap shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-xs font-medium text-text"
        >
          {chip.label}
          <span aria-hidden="true" className="text-text-muted">
            ✕
          </span>
          <span className="sr-only">Remove filter</span>
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="min-h-tap shrink-0 px-2 text-xs font-semibold text-text-muted underline"
      >
        Clear all
      </button>
    </div>
  );
}
