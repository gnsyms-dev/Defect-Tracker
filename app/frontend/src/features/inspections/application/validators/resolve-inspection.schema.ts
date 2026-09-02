import { z } from 'zod';

export const MIN_RESOLUTION_NOTE = 5;
export const MAX_RESOLUTION_NOTE = 1000;

/**
 * The resolution note is MANDATORY -- that is the brief's hardest rule, and it is
 * enforced at three layers: here for the UX, in the API DTO, and by a database CHECK
 * constraint that makes a resolved row without a non-blank note physically
 * unrepresentable.
 *
 * Trimmed BEFORE the length check, so whitespace cannot satisfy it.
 */
export const resolveInspectionSchema = z.object({
  resolutionNote: z
    .string()
    .trim()
    .min(1, 'A resolution note is required')
    // Blocks "ok" / "done" without fighting a legitimately terse note.
    .min(MIN_RESOLUTION_NOTE, `Add a little more detail (at least ${MIN_RESOLUTION_NOTE} characters)`)
    .max(MAX_RESOLUTION_NOTE, `Keep the note under ${MAX_RESOLUTION_NOTE} characters`),
});

export type ResolveInspectionFormValues = z.input<typeof resolveInspectionSchema>;
