import type { PlantSummary } from '@modules/plants/type/plant-directory.port';
import { Severity } from './inspection.enum';

export interface SummaryCounts {
  readonly open: number;
  readonly resolved: number;
  readonly total: number;
}

export interface SeveritySummary extends SummaryCounts {
  readonly severity: Severity;
}

export interface PlantSummaryCounts extends SummaryCounts {
  readonly plant: PlantSummary | null;
  readonly plantId: string;
}

export interface InspectionSummary {
  readonly totals: SummaryCounts;
  /**
   * Always exactly three entries in critical -> major -> minor order, zero-filled.
   *
   * Postgres returns NO row for an empty cell, so without this the UI would render
   * `undefined` where it expects 0 -- and the brief's summary has to show
   * "Critical / Open: 0" rather than omitting the row. Doing it here keeps the
   * client dumb and the grid layout stable.
   */
  readonly bySeverity: readonly SeveritySummary[];
  readonly byPlant: readonly PlantSummaryCounts[];
}
