import { z } from 'zod';
import { DefectType } from '../../application/domain/DefectType';
import { InspectionStatus } from '../../application/domain/InspectionStatus';
import { Severity } from '../../application/domain/Severity';

const plantDtoSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
});

const actorDtoSchema = z.object({
  id: z.string(),
  fullName: z.string(),
});

export const inspectionDtoSchema = z.object({
  id: z.string(),
  // Required, not optional: the whole offline merge depends on the server echoing it
  // back. Making it optional here would let a server regression silently degrade
  // dedupe into duplicate rows.
  clientUuid: z.string(),
  inspectionDate: z.string(),
  machineLineId: z.string(),
  defectType: z.enum([
    DefectType.WeaveDefect,
    DefectType.ShadeVariation,
    DefectType.HoleTear,
    DefectType.CountDeviation,
    DefectType.Other,
  ]),
  severity: z.enum([Severity.Critical, Severity.Major, Severity.Minor]),
  status: z.enum([InspectionStatus.Open, InspectionStatus.Resolved]),
  remarks: z.string().nullable().optional(),
  resolutionNote: z.string().nullable().optional(),
  resolvedBy: actorDtoSchema.nullable().optional(),
  resolvedAt: z.string().nullable().optional(),
  loggedBy: actorDtoSchema.nullable().optional(),
  plant: plantDtoSchema.nullable().optional(),
  loggedAt: z.string(),
  createdAt: z.string(),
  syncLagSeconds: z.number(),
});

export const inspectionPageDtoSchema = z.object({
  items: z.array(inspectionDtoSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
});

const summaryCountsDtoSchema = z.object({
  open: z.number(),
  resolved: z.number(),
  total: z.number(),
});

export const inspectionSummaryDtoSchema = z.object({
  totals: summaryCountsDtoSchema,
  bySeverity: z.array(
    summaryCountsDtoSchema.extend({
      severity: z.enum([Severity.Critical, Severity.Major, Severity.Minor]),
    }),
  ),
  byPlant: z.array(
    summaryCountsDtoSchema.extend({
      plantId: z.string(),
      plant: plantDtoSchema.nullable().optional(),
    }),
  ),
});

export type InspectionDto = z.infer<typeof inspectionDtoSchema>;
export type InspectionPageDto = z.infer<typeof inspectionPageDtoSchema>;
export type InspectionSummaryDto = z.infer<typeof inspectionSummaryDtoSchema>;

export interface CreateInspectionRequestDto {
  readonly clientUuid: string;
  readonly inspectionDate: string;
  readonly loggedAt: string;
  readonly machineLineId: string;
  readonly defectType: DefectType;
  readonly severity: Severity;
  readonly remarks?: string;
  // NOTE: no plantId and no loggedByUserId. The API runs its ValidationPipe with
  // forbidNonWhitelisted, so sending either would be a 400 -- the DTO's shape is
  // itself the first layer of scope enforcement, on both sides.
}

export interface ResolveInspectionRequestDto {
  readonly resolutionNote: string;
}
