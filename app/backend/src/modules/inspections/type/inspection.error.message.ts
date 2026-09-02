export const InspectionErrorMessage = {
  NotFound: 'Inspection not found.',
  AlreadyResolved: 'This inspection has already been resolved.',
  FutureDate: 'Inspection date cannot be in the future.',
  LoggedAtTooOld:
    'This entry is dated more than 30 days ago. Please check the device date and try again.',
  PlantNotOwned:
    'You can only log inspections for the plant you are assigned to.',
  InvalidDateRange: 'dateFrom must be on or before dateTo.',
  RemarksRequiredForOther:
    'Remarks are required when the defect type is Other.',
} as const;
