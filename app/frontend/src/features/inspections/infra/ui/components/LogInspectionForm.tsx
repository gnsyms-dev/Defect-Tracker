import { useWatch } from 'react-hook-form';
import { Button } from '@/shared/ui/Button';
import { FormField } from '@/shared/ui/FormField';
import { fieldAria } from '@/shared/ui/field-aria';
import { DateInput, SelectInput, TextArea, TextInput } from '@/shared/ui/inputs';
import { SegmentedField } from '@/shared/ui/SegmentedField';
import { useIsOffline } from '@/shared/offline/infra/ui/useConnectivity';
import { DEFECT_TYPE_OPTIONS, DefectType } from '../../../application/domain/DefectType';
import {
  SEVERITY_LABELS,
  SEVERITY_ORDER,
  SEVERITY_SELECTED_CLASSES,
  type Severity,
} from '../../../application/domain/Severity';
import { MACHINE_LINE_ID_FORMAT_HINT } from '../../../application/validators/log-inspection.schema';
import {
  useLogInspectionViewModel,
  type LogResultBanner,
} from '../view-models/useLogInspectionViewModel';

const SEVERITY_OPTIONS = SEVERITY_ORDER.map((value) => ({
  value,
  label: SEVERITY_LABELS[value],
  selectedClassName: SEVERITY_SELECTED_CLASSES[value],
}));

export interface LogInspectionFormProps {
  readonly onLogged: (result: LogResultBanner) => void;
}

export function LogInspectionForm({ onLogged }: LogInspectionFormProps) {
  const vm = useLogInspectionViewModel(onLogged);
  const { register, formState } = vm.form;
  const { errors } = formState;
  const isOffline = useIsOffline();
  // useWatch rather than form.watch() -- see the note in the view-model.
  const defectType = useWatch({ control: vm.form.control, name: 'defectType' });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        vm.submit();
      }}
      // Single column, one field per row. Field order follows the order things are
      // actually observed on the floor: when, where, what, how bad, notes.
      className="flex flex-col gap-4 p-4 pb-2"
    >
      {vm.formError ? (
        <p
          role="alert"
          className="rounded-control border border-critical/40 bg-critical-bg px-3 py-2 text-sm font-medium text-critical"
        >
          {vm.formError}
        </p>
      ) : null}

      <FormField
        id="inspectionDate"
        label="Date"
        error={errors.inspectionDate?.message}
        isRequired
      >
        <DateInput
          {...register('inspectionDate')}
          {...fieldAria('inspectionDate', {
            hasError: Boolean(errors.inspectionDate),
            hasHint: false,
          })}
          max={vm.maxDate}
        />
      </FormField>

      <FormField
        id="machineLineId"
        label="Machine / Line ID"
        hint={`${MACHINE_LINE_ID_FORMAT_HINT}. Recent IDs are suggested as you type.`}
        error={errors.machineLineId?.message}
        isRequired
      >
        <TextInput
          {...register('machineLineId')}
          {...fieldAria('machineLineId', {
            hasError: Boolean(errors.machineLineId),
            hasHint: true,
          })}
          list="recent-machine-ids"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="LOOMA-004"
        />
        <datalist id="recent-machine-ids">
          {vm.recentMachineIds.map((id) => (
            <option key={id} value={id} />
          ))}
        </datalist>
      </FormField>

      <FormField
        id="defectType"
        label="Defect type"
        error={errors.defectType?.message}
        isRequired
      >
        <SelectInput
          {...register('defectType')}
          {...fieldAria('defectType', {
            hasError: Boolean(errors.defectType),
            hasHint: false,
          })}
          options={DEFECT_TYPE_OPTIONS}
        />
      </FormField>

      {/* Severity as a segmented control rather than a select: one tap instead of
          three, readable at a glance, and colour-codable. */}
      <SegmentedField<Severity>
        name="severity"
        legend="Severity"
        isRequired
        options={SEVERITY_OPTIONS}
        value={vm.severity}
        onChange={vm.setSeverity}
        error={errors.severity?.message}
      />

      <FormField
        id="remarks"
        label="Remarks"
        hint={
          defectType === DefectType.Other
            ? 'Required for "Other" — describe what you saw.'
            : 'Optional'
        }
        error={errors.remarks?.message}
        isRequired={defectType === DefectType.Other}
      >
        <TextArea
          {...register('remarks')}
          {...fieldAria('remarks', {
            hasError: Boolean(errors.remarks),
            hasHint: true,
          })}
          rows={3}
          placeholder="Anything the mechanic or QA should know"
        />
      </FormField>

      {/* Sticky action bar so Save stays thumb-reachable without scrolling past
          Remarks, and stays above the on-screen keyboard. */}
      <div className="sticky bottom-0 -mx-4 mt-2 border-t border-border bg-surface px-4 py-3">
        <Button type="submit" size="lg" isFullWidth isLoading={vm.isSubmitting}>
          {isOffline ? 'Save on this device' : 'Save inspection'}
        </Button>
        {isOffline ? (
          <p className="mt-2 text-center text-xs text-text-muted">
            You&apos;re offline — this will sync automatically later.
          </p>
        ) : null}
      </div>
    </form>
  );
}
