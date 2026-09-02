import {
  DefectType,
  InspectionStatus,
  Severity,
} from '../../type/inspection.enum';

export class InspectionEntity {
  constructor(
    public readonly id: string,
    /** Client-generated idempotency key; echoed back so the offline outbox can dedupe. */
    public readonly clientUuid: string,
    public readonly plantId: string,
    public readonly loggedByUserId: string,
    /**
     * A calendar date as `YYYY-MM-DD`, deliberately a string and not a Date.
     * Postgres DATEONLY round-trips as a string, and constructing a Date here
     * would reintroduce exactly the timezone shift the DATE column exists to
     * avoid.
     */
    public readonly inspectionDate: string,
    public readonly machineLineId: string,
    public readonly defectType: DefectType,
    public readonly severity: Severity,
    public readonly status: InspectionStatus,
    public readonly remarks: string | null,
    public readonly resolutionNote: string | null,
    public readonly resolvedByUserId: string | null,
    public readonly resolvedAt: Date | null,
    /** Device clock when Save was pressed. */
    public readonly loggedAt: Date,
    /** Server insert time. `createdAt - loggedAt` is the sync lag. */
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  get isResolved(): boolean {
    return this.status === InspectionStatus.Resolved;
  }
}
