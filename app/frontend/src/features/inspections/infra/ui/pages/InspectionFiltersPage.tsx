import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { usePlantDeps } from '@/app/di/useAppDI';
import { RoutePath } from '@/app/route-paths';
import { canViewAllPlants } from '@/features/auth/application/domain/UserRole';
import { useAuth } from '@/features/auth/infra/di/useAuth';
import type { Plant } from '@/features/plants/application/domain/entities/Plant';
import { plantLabel } from '@/features/plants/application/domain/entities/Plant';
import { cn } from '@/shared/lib/cn';
import { todayInPlantTimeZone } from '@/shared/lib/datetime';
import { Button } from '@/shared/ui/Button';
import { FormField } from '@/shared/ui/FormField';
import { fieldAria } from '@/shared/ui/field-aria';
import { DateInput, SelectInput, TextInput } from '@/shared/ui/inputs';
import { SegmentedField } from '@/shared/ui/SegmentedField';
import { Sheet } from '@/shared/ui/Sheet';
import { DEFECT_TYPE_LABELS, DEFECT_TYPE_ORDER, type DefectType } from '../../../application/domain/DefectType';
import { InspectionStatus, STATUS_LABELS } from '../../../application/domain/InspectionStatus';
import {
  SEVERITY_BADGE_CLASSES,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
  type Severity,
} from '../../../application/domain/Severity';
import {
  filtersFromSearchParams,
  searchParamsFromFilters,
} from '../filters-search-params';

type StatusChoice = InspectionStatus | 'all';

/**
 * A ROUTE rendered as a bottom sheet, not a modal held in component state.
 *
 * The route is what makes the Android hardware back button close the sheet instead of
 * leaving the list -- a modal in state fails that, and users hate it. It also means a
 * filtered view survives a refresh and is shareable, and the cache key derives from
 * the same URL params.
 */
export function InspectionFiltersPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { plantRepository } = usePlantDeps();
  const { session } = useAuth();

  const initial = filtersFromSearchParams(searchParams);
  const [severity, setSeverity] = useState<readonly Severity[]>(initial.severity ?? []);
  const [defectType, setDefectType] = useState<readonly DefectType[]>(
    initial.defectType ?? [],
  );
  const [status, setStatus] = useState<StatusChoice>(initial.status ?? 'all');
  const [dateFrom, setDateFrom] = useState(initial.dateFrom ?? '');
  const [dateTo, setDateTo] = useState(initial.dateTo ?? '');
  const [plantId, setPlantId] = useState(initial.plantId ?? '');
  const [machineLineId, setMachineLineId] = useState(initial.machineLineId ?? '');
  const [plants, setPlants] = useState<readonly Plant[]>([]);

  const role =
    session.status === 'authenticated' || session.status === 'expired'
      ? session.user.role
      : null;
  // Hidden for a single-plant supervisor: the API scopes them to their own rows
  // regardless, so offering it would be a control that cannot change anything.
  const showsPlantFilter = role ? canViewAllPlants(role) : false;

  useEffect(() => {
    if (!showsPlantFilter) {
      return;
    }
    let isCurrent = true;
    void plantRepository
      .listActive()
      .then((loaded) => {
        if (isCurrent) {
          setPlants(loaded);
        }
      })
      .catch(() => {
        // A missing plant list degrades one filter; it must not break the sheet.
      });
    return () => {
      isCurrent = false;
    };
  }, [plantRepository, showsPlantFilter]);

  const close = (): void => void navigate(-1);

  const apply = (): void => {
    const params = searchParamsFromFilters({
      severity: severity.length > 0 ? severity : undefined,
      defectType: defectType.length > 0 ? defectType : undefined,
      status: status === 'all' ? undefined : status,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      plantId: plantId || undefined,
      machineLineId: machineLineId.trim() || undefined,
      sortBy: initial.sortBy,
      sortDir: initial.sortDir,
    });

    // Navigate to the list WITH the query string in a single call. Calling
    // setSearchParams here instead would apply the params to this route
    // (/inspections/filters) and the subsequent navigate() would then drop them --
    // the filters would visibly apply and then vanish from the URL, taking
    // shareability and refresh-survival with them.
    const query = params.toString();
    void navigate(
      query ? `${RoutePath.Inspections}?${query}` : RoutePath.Inspections,
      { replace: true },
    );
  };

  const reset = (): void => {
    setSeverity([]);
    setDefectType([]);
    setStatus('all');
    setDateFrom('');
    setDateTo('');
    setPlantId('');
    setMachineLineId('');
  };

  const isRangeInvalid = Boolean(dateFrom && dateTo && dateFrom > dateTo);

  return (
    <Sheet
      title="Filters"
      onClose={close}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" isFullWidth onClick={reset}>
            Reset
          </Button>
          <Button size="lg" isFullWidth disabled={isRangeInvalid} onClick={apply}>
            Apply
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <SegmentedField<StatusChoice>
          name="status"
          legend="Status"
          options={[
            { value: 'all', label: 'All' },
            { value: InspectionStatus.Open, label: STATUS_LABELS[InspectionStatus.Open] },
            {
              value: InspectionStatus.Resolved,
              label: STATUS_LABELS[InspectionStatus.Resolved],
            },
          ]}
          value={status}
          onChange={setStatus}
        />

        <MultiChipGroup
          legend="Severity"
          options={SEVERITY_ORDER.map((value) => ({
            value,
            label: SEVERITY_LABELS[value],
            selectedClassName: SEVERITY_BADGE_CLASSES[value],
          }))}
          selected={severity}
          onToggle={(value) =>
            setSeverity((current) =>
              current.includes(value)
                ? current.filter((entry) => entry !== value)
                : [...current, value],
            )
          }
        />

        <MultiChipGroup
          legend="Defect type"
          options={DEFECT_TYPE_ORDER.map((value) => ({
            value,
            label: DEFECT_TYPE_LABELS[value],
          }))}
          selected={defectType}
          onToggle={(value) =>
            setDefectType((current) =>
              current.includes(value)
                ? current.filter((entry) => entry !== value)
                : [...current, value],
            )
          }
        />

        <div className="grid grid-cols-2 gap-3">
          <FormField id="dateFrom" label="From">
            <DateInput
              {...fieldAria('dateFrom', { hasError: false, hasHint: false })}
              value={dateFrom}
              max={todayInPlantTimeZone()}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </FormField>
          <FormField
            id="dateTo"
            label="To"
            error={isRangeInvalid ? 'Must be on or after From' : undefined}
          >
            <DateInput
              {...fieldAria('dateTo', { hasError: isRangeInvalid, hasHint: false })}
              value={dateTo}
              max={todayInPlantTimeZone()}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </FormField>
        </div>

        {showsPlantFilter ? (
          <FormField id="plantId" label="Plant">
            <SelectInput
              {...fieldAria('plantId', { hasError: false, hasHint: false })}
              value={plantId}
              placeholder="All plants"
              options={plants.map((plant) => ({
                value: plant.id,
                label: plantLabel(plant),
              }))}
              onChange={(event) => setPlantId(event.target.value)}
            />
          </FormField>
        ) : null}

        <FormField id="machineLineId" label="Machine / Line ID contains">
          <TextInput
            {...fieldAria('machineLineId', { hasError: false, hasHint: false })}
            value={machineLineId}
            autoCapitalize="characters"
            autoCorrect="off"
            placeholder="LOOM"
            onChange={(event) => setMachineLineId(event.target.value)}
          />
        </FormField>
      </div>
    </Sheet>
  );
}

interface MultiChipGroupProps<TValue extends string> {
  readonly legend: string;
  readonly options: readonly {
    value: TValue;
    label: string;
    selectedClassName?: string;
  }[];
  readonly selected: readonly TValue[];
  readonly onToggle: (value: TValue) => void;
}

/** Real checkboxes, so multi-select is announced correctly by assistive tech. */
function MultiChipGroup<TValue extends string>({
  legend,
  options,
  selected,
  onToggle,
}: MultiChipGroupProps<TValue>) {
  return (
    <fieldset className="border-0 p-0">
      <legend className="mb-2 text-sm font-medium text-text">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const id = `${legend}-${option.value}`;
          const isSelected = selected.includes(option.value);
          return (
            <div key={option.value}>
              <input
                type="checkbox"
                id={id}
                checked={isSelected}
                onChange={() => onToggle(option.value)}
                className="peer sr-only"
              />
              <label
                htmlFor={id}
                className={cn(
                  'inline-flex min-h-tap cursor-pointer items-center rounded-full border px-3 text-sm font-medium',
                  'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent',
                  isSelected
                    ? cn('border-transparent', option.selectedClassName ?? 'bg-accent text-accent-fg')
                    : 'border-border bg-surface text-text-muted',
                )}
              >
                {option.label}
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
