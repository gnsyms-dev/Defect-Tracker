import { z } from 'zod';
import { todayInPlantTimeZone } from '@/shared/lib/datetime';
import { DefectType } from '../domain/DefectType';
import { Severity } from '../domain/Severity';

const MAX_REMARKS = 1000;

/**
 * Mirrors `MACHINE_LINE_ID_PATTERN` on the server: machines are stencilled on the
 * floor as a five-letter section code, a hyphen, then a zero-padded three-digit unit
 * number (LOOMA-004, WEAVE-112). Letting free text through turns "loom 4" and
 * "LOOMA-004" into two different machines in every report that groups by this column.
 */
export const MACHINE_LINE_ID_PATTERN = /^[A-Z]{5}-\d{3}$/;

/**
 * Both the field hint and the error message, so what the supervisor is told BEFORE
 * typing and what they are told after a mistake cannot drift apart.
 */
export const MACHINE_LINE_ID_FORMAT_HINT =
  '5 letters, a hyphen, then 3 digits — e.g. LOOMA-004';

/**
 * Mirrors the server's rules so the user never has to round-trip to learn about a
 * mistake -- and, more importantly, because the server's field-level errors are not
 * recoverable from its response (they are comma-joined into one string), so this
 * schema IS the field-level UX.
 */
export const logInspectionSchema = z
  .object({
    inspectionDate: z
      .string()
      .min(1, 'Choose the inspection date')
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid date')
      // Compared as strings against plant-local today. YYYY-MM-DD sorts
      // lexicographically the same way it sorts chronologically, so no Date is
      // constructed -- which is what keeps the timezone bug out of the client too.
      .refine((value) => value <= todayInPlantTimeZone(), {
        message: 'The date cannot be in the future',
      }),
    machineLineId: z
      .string()
      .trim()
      // Upper-cased before the format check, not validated against it: a lowercase
      // entry is unambiguous, so normalise it instead of making the supervisor
      // retype it. The server normalises identically.
      .toUpperCase()
      // Empty is its own message -- "enter something" is more useful than the format
      // rule when the field has simply not been filled in yet. No max() alongside the
      // pattern: it fixes the length at 9, so a length message could only ever be
      // noise competing with the one message that says how to fix the value.
      .min(1, 'Enter the machine or line ID')
      .regex(
        MACHINE_LINE_ID_PATTERN,
        `That doesn't look like a machine or line ID. Use ${MACHINE_LINE_ID_FORMAT_HINT}.`,
      ),
    defectType: z.enum([
      DefectType.WeaveDefect,
      DefectType.ShadeVariation,
      DefectType.HoleTear,
      DefectType.CountDeviation,
      DefectType.Other,
    ]),
    severity: z.enum([Severity.Critical, Severity.Major, Severity.Minor]),
    remarks: z
      .string()
      .trim()
      .max(MAX_REMARKS, `Keep remarks under ${MAX_REMARKS} characters`)
      .optional(),
  })
  // "Other" with no explanation produces data nobody can act on, so the server
  // requires remarks for it (and a DB CHECK backs that up). Enforced here as a
  // superRefine because it is a rule ACROSS two fields, and it must attach the
  // message to the remarks field so the form can show it in the right place.
  .superRefine((values, ctx) => {
    if (values.defectType === DefectType.Other && !values.remarks?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['remarks'],
        message: 'Describe the defect when the type is Other',
      });
    }
  });

export type LogInspectionFormValues = z.input<typeof logInspectionSchema>;
export type LogInspectionFormOutput = z.output<typeof logInspectionSchema>;
