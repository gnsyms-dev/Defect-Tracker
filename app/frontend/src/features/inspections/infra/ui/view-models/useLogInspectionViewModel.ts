import { useCallback, useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { useInspectionDeps } from '@/app/di/useAppDI';
import { RoutePath } from '@/app/route-paths';
import { toUserMessage } from '@/shared/api/errors';
import { useAsyncAction } from '@/shared/hooks/useAsyncAction';
import { todayInPlantTimeZone } from '@/shared/lib/datetime';
import { useAuth } from '@/features/auth/infra/di/useAuth';
import { DefectType } from '../../../application/domain/DefectType';
import { Severity } from '../../../application/domain/Severity';
import { parseDraftInspection } from '../../../application/validators/draft-inspection.schema';
import {
  logInspectionSchema,
  type LogInspectionFormValues,
} from '../../../application/validators/log-inspection.schema';

export type LogResultBanner =
  | { readonly kind: 'synced' }
  | { readonly kind: 'queued' };

export interface LogInspectionViewModel {
  readonly form: ReturnType<typeof useForm<LogInspectionFormValues>>;
  readonly severity: Severity | null;
  setSeverity(value: Severity): void;
  readonly submit: () => void;
  readonly isSubmitting: boolean;
  readonly formError: string | null;
  readonly maxDate: string;
  /** Recently used machine IDs, offered as a datalist. */
  readonly recentMachineIds: readonly string[];
}

/**
 * Orchestrates logging an inspection. The page component only renders.
 */
export function useLogInspectionViewModel(
  onLogged: (result: LogResultBanner) => void,
): LogInspectionViewModel {
  const { logInspection, outbox, inspectionRepository } = useInspectionDeps();
  const { userId } = useAuth();
  const navigate = useNavigate();
  const [recentMachineIds, setRecentMachineIds] = useState<readonly string[]>([]);

  const maxDate = todayInPlantTimeZone();

  const form = useForm<LogInspectionFormValues>({
    resolver: zodResolver(logInspectionSchema),
    mode: 'onTouched',
    defaultValues: {
      // Defaulting to today is right almost always -- a supervisor logs what they just
      // saw -- and `max` on the input makes a future date unreachable at the widget.
      inspectionDate: maxDate,
      machineLineId: '',
      defectType: DefectType.WeaveDefect,
      severity: Severity.Major,
      remarks: '',
    },
  });

  // useWatch, not form.watch(): watch() returns a fresh function on every render, which
  // makes React Compiler skip memoising this whole hook. useWatch subscribes through
  // `control` and is compiler-compatible.
  const severity =
    useWatch({ control: form.control, name: 'severity' }) ?? null;

  const setSeverity = useCallback(
    (value: Severity) => {
      form.setValue('severity', value, { shouldValidate: true, shouldTouch: true });
    },
    [form],
  );

  // Machine IDs the supervisor has actually used, from the server's recent rows plus
  // anything still queued locally. Free text per the brief, but this removes most of
  // the typing -- the single biggest speed win on a phone keyboard.
  useEffect(() => {
    let isCurrent = true;

    const load = async (): Promise<void> => {
      const ids = new Set<string>();
      try {
        const page = await inspectionRepository.list({
          sortBy: 'createdAt',
          sortDir: 'desc',
          page: 1,
          limit: 20,
        });
        for (const item of page.items) {
          ids.add(item.machineLineId);
        }
      } catch {
        // Offline or failing: a missing convenience list must never block the form.
      }

      if (userId) {
        for (const record of await outbox.listByUser(userId)) {
          const draft = parseDraftInspection(record.payload);
          if (draft) {
            ids.add(draft.machineLineId);
          }
        }
      }

      if (isCurrent) {
        setRecentMachineIds([...ids].slice(0, 10));
      }
    };

    void load();
    return () => {
      isCurrent = false;
    };
  }, [inspectionRepository, outbox, userId]);

  const action = useAsyncAction(async (values: LogInspectionFormValues) => {
    const outcome = await logInspection.execute({
      inspectionDate: values.inspectionDate,
      machineLineId: values.machineLineId,
      defectType: values.defectType,
      severity: values.severity,
      remarks: values.remarks ?? null,
    });

    form.reset({
      inspectionDate: maxDate,
      machineLineId: '',
      defectType: DefectType.WeaveDefect,
      severity: Severity.Major,
      remarks: '',
    });

    const banner: LogResultBanner =
      outcome.kind === 'synced' ? { kind: 'synced' } : { kind: 'queued' };
    onLogged(banner);
    // Carried in navigation state so the list can confirm what actually happened.
    // "Saved on this device" and "Inspection saved" are genuinely different facts, and
    // showing the wrong one is the one dishonesty that would break trust in the tool.
    void navigate(RoutePath.Inspections, { state: { logResult: banner.kind } });
  });

  const submit = form.handleSubmit(async (values) => {
    await action.run(values);
  });

  return {
    form,
    severity,
    setSeverity,
    submit: () => void submit(),
    isSubmitting: action.isRunning,
    formError: action.error ? toUserMessage(action.error) : null,
    maxDate,
    recentMachineIds,
  };
}
