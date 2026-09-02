export const InspectionStatus = {
  Open: 'open',
  Resolved: 'resolved',
} as const;
export type InspectionStatus =
  (typeof InspectionStatus)[keyof typeof InspectionStatus];

export const STATUS_LABELS: Readonly<Record<InspectionStatus, string>> = {
  [InspectionStatus.Open]: 'Open',
  [InspectionStatus.Resolved]: 'Resolved',
};

export const STATUS_BADGE_CLASSES: Readonly<Record<InspectionStatus, string>> = {
  [InspectionStatus.Open]: 'bg-open-bg text-open',
  [InspectionStatus.Resolved]: 'bg-resolved-bg text-resolved',
};

export const InspectionSortField = {
  InspectionDate: 'inspectionDate',
  CreatedAt: 'createdAt',
  Severity: 'severity',
} as const;
export type InspectionSortField =
  (typeof InspectionSortField)[keyof typeof InspectionSortField];

export const SORT_FIELD_LABELS: Readonly<Record<InspectionSortField, string>> = {
  [InspectionSortField.InspectionDate]: 'Date',
  [InspectionSortField.CreatedAt]: 'Logged',
  [InspectionSortField.Severity]: 'Severity',
};

export const SortDirection = {
  Asc: 'asc',
  Desc: 'desc',
} as const;
export type SortDirection = (typeof SortDirection)[keyof typeof SortDirection];
