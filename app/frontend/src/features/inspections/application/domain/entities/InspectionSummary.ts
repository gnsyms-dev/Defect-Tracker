import type { Severity } from '../Severity';
import type { InspectionPlant } from './Inspection';

export interface SummaryCounts {
  readonly open: number;
  readonly resolved: number;
  readonly total: number;
}

export interface SeveritySummary extends SummaryCounts {
  readonly severity: Severity;
}

export interface PlantSummary extends SummaryCounts {
  readonly plantId: string;
  readonly plant: InspectionPlant | null;
}

export interface InspectionSummary {
  readonly totals: SummaryCounts;
  /** Always three entries, critical -> major -> minor, zero-filled by the server. */
  readonly bySeverity: readonly SeveritySummary[];
  readonly byPlant: readonly PlantSummary[];
}
