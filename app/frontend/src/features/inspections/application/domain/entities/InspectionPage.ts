import type { Inspection } from './Inspection';

export interface InspectionPage {
  readonly items: readonly Inspection[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
}
