import { z } from 'zod';
import { DefectType } from '../domain/DefectType';
import { Severity } from '../domain/Severity';

/**
 * Validates a DraftInspection read back OUT of IndexedDB.
 *
 * Not redundant with the form schema: a queued record may have been written by a
 * previous deploy of the app, so what comes out of the store is genuinely `unknown`.
 * This is the schema the outbox handler registers with the sync engine.
 */
export const draftInspectionSchema = z.object({
  clientUuid: z.string().min(1),
  inspectionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  machineLineId: z.string().min(1),
  defectType: z.enum([
    DefectType.WeaveDefect,
    DefectType.ShadeVariation,
    DefectType.HoleTear,
    DefectType.CountDeviation,
    DefectType.Other,
  ]),
  severity: z.enum([Severity.Critical, Severity.Major, Severity.Minor]),
  remarks: z.string().nullable(),
  loggedAt: z.string().min(1),
});

export function parseDraftInspection(payload: unknown) {
  const result = draftInspectionSchema.safeParse(payload);
  return result.success ? result.data : null;
}
