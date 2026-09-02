import { useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useInspectionDeps } from '@/app/di/useAppDI';
import { inspectionDetailPath, RoutePath } from '@/app/route-paths';
import { toUserMessage } from '@/shared/api/errors';
import { useAsyncAction } from '@/shared/hooks/useAsyncAction';
import { useAsyncData } from '@/shared/hooks/useAsyncData';
import { useSessionDraft } from '@/shared/hooks/useSessionDraft';
import { formatCalendarDate } from '@/shared/lib/datetime';
import { useIsOffline } from '@/shared/offline/infra/ui/useConnectivity';
import { Button } from '@/shared/ui/Button';
import { Card, ErrorState, Spinner } from '@/shared/ui/feedback';
import { FormField } from '@/shared/ui/FormField';
import { fieldAria } from '@/shared/ui/field-aria';
import { TextArea } from '@/shared/ui/inputs';
import { DEFECT_TYPE_LABELS } from '../../../application/domain/DefectType';
import { InspectionStatus } from '../../../application/domain/InspectionStatus';
import type { Inspection } from '../../../application/domain/entities/Inspection';
import {
  MAX_RESOLUTION_NOTE,
  MIN_RESOLUTION_NOTE,
  resolveInspectionSchema,
} from '../../../application/validators/resolve-inspection.schema';
import { SeverityBadge } from '../components/SeverityBadge';

/**
 * A dedicated FULL-SCREEN route, not a modal.
 *
 * Four reasons: a mandatory multi-line note needs the keyboard, which eats ~45% of a
 * 390px viewport and would clip a centred modal; the route survives a refresh and the
 * phone backgrounding the tab; back means cancel, free and unambiguous; and there is
 * room to restate WHICH inspection is being resolved -- the real risk in a modal that
 * shows only a note field is resolving the wrong row.
 */
export function ResolveInspectionPage() {
  const { id } = useParams<{ id: string }>();
  const { inspectionRepository } = useInspectionDeps();
  const navigate = useNavigate();
  const isOffline = useIsOffline();

  // Persisted per tab, so an accidental refresh or the OS reclaiming the tab does not
  // discard what the QA manager had typed.
  const [note, setNote, clearNote] = useSessionDraft(`resolve-note:${id ?? ''}`);

  const loader = useCallback(
    () => inspectionRepository.getById(id ?? ''),
    [id, inspectionRepository],
  );
  const state = useAsyncData<Inspection>(`inspection:${id ?? ''}`, loader);

  const action = useAsyncAction(async () => {
    const parsed = resolveInspectionSchema.safeParse({ resolutionNote: note });
    if (!parsed.success) {
      throw new Error(
        parsed.error.issues[0]?.message ?? 'A resolution note is required',
      );
    }
    await inspectionRepository.resolve(id ?? '', parsed.data.resolutionNote);
    clearNote();
    void navigate(inspectionDetailPath(id ?? ''), { replace: true });
  });

  if (state.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (state.error || !state.data) {
    return (
      <ErrorState
        title="Couldn’t load this inspection"
        description={state.error ? toUserMessage(state.error) : 'Inspection not found.'}
        action={
          <Link to={RoutePath.Inspections}>
            <Button variant="secondary">Back to list</Button>
          </Link>
        }
      />
    );
  }

  const inspection = state.data;

  if (inspection.status === InspectionStatus.Resolved) {
    // Someone else got there first. The API would answer 409; showing it here avoids
    // letting the QA manager type a note that cannot be saved.
    return (
      <ErrorState
        title="Already resolved"
        description={`Resolved by ${inspection.resolvedBy?.fullName ?? 'someone else'}.`}
        action={
          <Link to={inspectionDetailPath(inspection.id)}>
            <Button variant="secondary">View details</Button>
          </Link>
        }
      />
    );
  }

  const trimmedLength = note.trim().length;
  const canSubmit = trimmedLength >= MIN_RESOLUTION_NOTE && !isOffline;

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-col gap-3 p-4">
        <h1 className="text-lg font-semibold text-text">Resolve inspection</h1>

        {/* Restating the inspection is the whole point of using a route: it makes
            resolving the wrong row much harder. */}
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <SeverityBadge severity={inspection.severity} />
            <span className="text-sm font-semibold text-text">
              {inspection.machineLineId}
            </span>
          </div>
          <p className="mt-1 text-sm text-text-muted">
            {DEFECT_TYPE_LABELS[inspection.defectType]} ·{' '}
            {formatCalendarDate(inspection.inspectionDate)}
          </p>
          {inspection.remarks ? (
            <p className="mt-1 text-sm text-text-muted">{inspection.remarks}</p>
          ) : null}
        </Card>

        {isOffline ? (
          <p className="rounded-control bg-offline-bg px-3 py-2 text-sm text-offline">
            Resolving needs a connection. Your note is kept on this screen until you
            reconnect.
          </p>
        ) : null}

        {action.error ? (
          <p role="alert" className="text-sm font-medium text-critical">
            {toUserMessage(action.error)}
          </p>
        ) : null}

        <FormField
          id="resolutionNote"
          label="Resolution note"
          hint="Required — what was done to fix it?"
          isRequired
          error={
            trimmedLength > 0 && trimmedLength < MIN_RESOLUTION_NOTE
              ? `Add a little more detail (at least ${MIN_RESOLUTION_NOTE} characters)`
              : undefined
          }
        >
          <TextArea
            {...fieldAria('resolutionNote', {
              hasError: trimmedLength > 0 && trimmedLength < MIN_RESOLUTION_NOTE,
              hasHint: true,
            })}
            rows={5}
            value={note}
            maxLength={MAX_RESOLUTION_NOTE}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Mechanic re-tensioned the warp and reset the temple. Verified two rolls clean after."
          />
        </FormField>
        <p className="text-right text-xs text-text-muted">
          {trimmedLength}/{MAX_RESOLUTION_NOTE}
        </p>
      </div>

      <div className="sticky bottom-0 mt-auto flex gap-2 border-t border-border bg-surface px-4 py-3">
        <Button variant="secondary" isFullWidth onClick={() => void navigate(-1)}>
          Cancel
        </Button>
        <Button
          size="lg"
          isFullWidth
          disabled={!canSubmit}
          isLoading={action.isRunning}
          onClick={() => void action.run()}
        >
          Mark resolved
        </Button>
      </div>
    </div>
  );
}
