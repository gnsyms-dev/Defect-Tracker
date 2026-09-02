import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DefectType,
  InspectionStatus,
  Severity,
} from '../../type/inspection.enum';

export class InspectionPlantDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'GJ-SUR-01' }) code: string;
  @ApiProperty({ example: 'Surat Weaving Unit 1' }) name: string;
}

export class InspectionActorDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Rakesh Patel' }) fullName: string;
}

export class InspectionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    format: 'uuid',
    description:
      'Echoed back deliberately: it is the join key the offline outbox uses to recognise a locally-created row once the server version arrives, so it must be present on every read as well as on create.',
  })
  clientUuid: string;

  @ApiProperty({ example: '2026-09-01' })
  inspectionDate: string;

  @ApiProperty({ example: 'LOOMA-004' })
  machineLineId: string;

  @ApiProperty({ enum: DefectType, enumName: 'DefectType' })
  defectType: DefectType;

  @ApiProperty({ enum: Severity, enumName: 'Severity' })
  severity: Severity;

  @ApiProperty({ enum: InspectionStatus, enumName: 'InspectionStatus' })
  status: InspectionStatus;

  @ApiPropertyOptional({ nullable: true })
  remarks: string | null;

  @ApiPropertyOptional({ nullable: true })
  resolutionNote: string | null;

  @ApiPropertyOptional({ nullable: true, type: InspectionActorDto })
  resolvedBy: InspectionActorDto | null;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  resolvedAt: string | null;

  @ApiPropertyOptional({ nullable: true, type: InspectionActorDto })
  loggedBy: InspectionActorDto | null;

  @ApiPropertyOptional({ nullable: true, type: InspectionPlantDto })
  plant: InspectionPlantDto | null;

  @ApiProperty({
    format: 'date-time',
    description: 'Device clock when Save was pressed.',
  })
  loggedAt: string;

  @ApiProperty({
    format: 'date-time',
    description:
      'Server insert time. createdAt - loggedAt is the sync lag, which is the metric that shows the paper register was actually replaced.',
  })
  createdAt: string;

  @ApiProperty({
    description:
      'Seconds between the supervisor pressing Save and the server storing it. 0 when logged online.',
    example: 0,
  })
  syncLagSeconds: number;
}

export class SummaryCountsDto {
  @ApiProperty() open: number;
  @ApiProperty() resolved: number;
  @ApiProperty() total: number;
}

export class SeveritySummaryDto extends SummaryCountsDto {
  @ApiProperty({ enum: Severity, enumName: 'Severity' })
  severity: Severity;
}

export class PlantSummaryDto extends SummaryCountsDto {
  @ApiProperty({ format: 'uuid' }) plantId: string;
  @ApiPropertyOptional({ nullable: true, type: InspectionPlantDto })
  plant: InspectionPlantDto | null;
}

export class InspectionSummaryResponseDto {
  @ApiProperty({ type: SummaryCountsDto })
  totals: SummaryCountsDto;

  @ApiProperty({
    type: SeveritySummaryDto,
    isArray: true,
    description:
      'Always exactly three entries, critical -> major -> minor, zero-filled. Postgres returns no row for an empty cell, so filling here keeps the client from rendering undefined where it expects 0.',
  })
  bySeverity: SeveritySummaryDto[];

  @ApiProperty({ type: PlantSummaryDto, isArray: true })
  byPlant: PlantSummaryDto[];
}
