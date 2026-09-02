import { z } from 'zod';
import { todayInPlantTimeZone } from '@/shared/lib/datetime';
import { DefectType } from '../domain/DefectType';
import { Severity } from '../domain/Severity';

const MAX_MACHINE_LINE_ID = 50;
const MAX_REMARKS = 1000;

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
      .min(1, 'Enter the machine or line ID')
      .max(MAX_MACHINE_LINE_ID, `Keep this under ${MAX_MACHINE_LINE_ID} characters`),
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
