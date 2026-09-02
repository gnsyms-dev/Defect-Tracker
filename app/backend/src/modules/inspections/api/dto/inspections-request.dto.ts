import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsCalendarDate } from '@shared/validators/is-calendar-date.validator';
import { PaginationQueryDto } from '@shared/dto/pagination-query.dto';
import {
  MAX_MACHINE_LINE_ID_LENGTH,
  MAX_REMARKS_LENGTH,
  MAX_RESOLUTION_NOTE_LENGTH,
  MIN_RESOLUTION_NOTE_LENGTH,
} from '../../type/inspection.constants';
import {
  DefectType,
  InspectionSortField,
  InspectionStatus,
  Severity,
  SortDirection,
} from '../../type/inspection.enum';

/**
 * Normalises a repeatable/CSV query parameter into an array.
 *
 * Express hands back an array for `?severity=a&severity=b` but a bare STRING for
 * `?severity=a`, and class-transformer will not reconcile that on its own. This
 * accepts both shapes plus the comma-separated form the frontend actually sends.
 */
function toArray<T>(value: unknown): T[] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  // `unknown[]` throughout, so no `any` leaks out of the flatMap/map chain.
  const raw: unknown[] = Array.isArray(value) ? (value as unknown[]) : [value];
  const flattened = raw.flatMap((entry): unknown[] =>
    typeof entry === 'string' ? entry.split(',') : [entry],
  );
  const trimmed = flattened.map((entry): unknown =>
    typeof entry === 'string' ? entry.trim() : entry,
  );
  // The cast is at the boundary only: class-validator's @IsEnum(..., { each: true })
  // is what actually proves every element is a T.
  return trimmed.filter((entry) => entry !== '') as T[];
}

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateInspectionDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Client-generated idempotency key. Required on EVERY create, including online ones, so there is exactly one write path -- the online path is the one that also gets replayed after a lost response. Re-posting the same value returns the stored record with 200 instead of creating a duplicate.',
  })
  @IsUUID('4')
  clientUuid: string;

  @ApiProperty({
    example: '2026-09-01',
    description: 'Calendar date, YYYY-MM-DD.',
  })
  @IsCalendarDate()
  inspectionDate: string;

  @ApiProperty({
    example: '2026-09-01T14:32:10+05:30',
    description:
      'Device clock when the supervisor pressed Save. Sent with an offset so the instant is unambiguous. Clamped server-side; forward skew beyond 5 minutes becomes now().',
  })
  @IsISO8601({ strict: true })
  loggedAt: string;

  @ApiProperty({ example: 'LOOM-04', maxLength: MAX_MACHINE_LINE_ID_LENGTH })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_MACHINE_LINE_ID_LENGTH)
  machineLineId: string;

  @ApiProperty({ enum: DefectType, enumName: 'DefectType' })
  @IsEnum(DefectType)
  defectType: DefectType;

  @ApiProperty({ enum: Severity, enumName: 'Severity' })
  @IsEnum(Severity)
  severity: Severity;

  @ApiPropertyOptional({
    maxLength: MAX_REMARKS_LENGTH,
    description:
      'Optional in general, but REQUIRED when defectType is "other". That conditional rule is enforced in the domain service, not here: @IsOptional() makes class-validator skip every other validator on the property when the value is absent, so a @ValidateIf/@IsNotEmpty pair alongside it never runs.',
  })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(MAX_REMARKS_LENGTH)
  remarks?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      "Optional, and only ever allowed to match the caller's own plant -- a mismatch is 403. Omit it and the plant is taken from the authenticated user.",
  })
  @IsOptional()
  @IsUUID('4')
  plantId?: string;

  // NOTE what is absent: loggedByUserId. Because main.ts runs the global
  // ValidationPipe with forbidNonWhitelisted: true, sending it is a 400 rather than
  // a silently ignored field -- the DTO's *shape* is the first layer of scope
  // enforcement.
}

export class InspectionFilterDto {
  @ApiPropertyOptional({
    enum: Severity,
    isArray: true,
    description: 'Repeatable or comma-separated, e.g. ?severity=critical,major',
  })
  @Transform(({ value }) => toArray<Severity>(value))
  @IsOptional()
  @IsEnum(Severity, { each: true })
  severity?: Severity[];

  @ApiPropertyOptional({ enum: InspectionStatus })
  @IsOptional()
  @IsEnum(InspectionStatus)
  status?: InspectionStatus;

  @ApiPropertyOptional({ enum: DefectType, isArray: true })
  @Transform(({ value }) => toArray<DefectType>(value))
  @IsOptional()
  @IsEnum(DefectType, { each: true })
  defectType?: DefectType[];

  @ApiPropertyOptional({ example: '2026-07-01', description: 'Inclusive.' })
  @IsOptional()
  @IsCalendarDate()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-09-01', description: 'Inclusive.' })
  @IsOptional()
  @IsCalendarDate()
  dateTo?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  plantId?: string;

  @ApiPropertyOptional({
    description: 'Case-insensitive substring match on the machine/line id.',
  })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(MAX_MACHINE_LINE_ID_LENGTH)
  machineLineId?: string;
}

export class ListInspectionsQueryDto extends IntersectionType(
  InspectionFilterDto,
  PaginationQueryDto,
) {
  @ApiPropertyOptional({
    enum: InspectionSortField,
    default: InspectionSortField.InspectionDate,
    description:
      'Whitelisted, and that matters: this value reaches a Sequelize order clause, where an arbitrary string would be an injection vector and an unindexed column would be a free denial of service.',
  })
  @IsOptional()
  @IsEnum(InspectionSortField)
  sortBy: InspectionSortField = InspectionSortField.InspectionDate;

  @ApiPropertyOptional({ enum: SortDirection, default: SortDirection.Desc })
  @IsOptional()
  @IsEnum(SortDirection)
  sortDir: SortDirection = SortDirection.Desc;
}

export class ResolveInspectionDto {
  @ApiProperty({
    minLength: MIN_RESOLUTION_NOTE_LENGTH,
    maxLength: MAX_RESOLUTION_NOTE_LENGTH,
    example: 'Mechanic re-tensioned the warp and reset the temple.',
    description:
      'Mandatory. Trimmed before validation so whitespace cannot satisfy it; the DB CHECK constraint is the backstop.',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  // Blocks "ok" / "done" without fighting a legitimately terse note.
  @MinLength(MIN_RESOLUTION_NOTE_LENGTH)
  @MaxLength(MAX_RESOLUTION_NOTE_LENGTH)
  resolutionNote: string;
}
