import type { DefectType } from '../DefectType';
import type { InspectionStatus } from '../InspectionStatus';
import type { Severity } from '../Severity';

export interface InspectionPlant {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface InspectionActor {
  readonly id: string;
  readonly fullName: string;
}

export interface Inspection {
  readonly id: string;
  /**
   * The client-generated idempotency key, ECHOED BACK by the API.
   *
   * Without the echo, recognising that a locally-queued row has arrived from the
   * server would fall back to matching on field values -- which breaks the moment two
   * identical defects are logged on one machine on one day, which is exactly what
   * real fabric defects do.
   */
  readonly clientUuid: string;
  /** `YYYY-MM-DD`. A string end to end: no Date is ever constructed from it. */
  readonly inspectionDate: string;
  readonly machineLineId: string;
  readonly defectType: DefectType;
  readonly severity: Severity;
  readonly status: InspectionStatus;
  readonly remarks: string | null;
  readonly resolutionNote: string | null;
  readonly resolvedBy: InspectionActor | null;
  readonly resolvedAt: string | null;
  readonly loggedBy: InspectionActor | null;
  readonly plant: InspectionPlant | null;
  /** Device clock when Save was pressed. */
  readonly loggedAt: string;
  /** Server insert time. */
  readonly createdAt: string;
  /** createdAt - loggedAt. 0 when logged online. */
  readonly syncLagSeconds: number;
}
