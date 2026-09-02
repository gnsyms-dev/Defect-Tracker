/** Route paths as constants, so no screen builds a URL from a magic string. */
export const RoutePath = {
  Login: '/login',
  Log: '/log',
  Inspections: '/inspections',
  InspectionFilters: '/inspections/filters',
  InspectionDetail: '/inspections/:id',
  InspectionResolve: '/inspections/:id/resolve',
  Pending: '/pending',
  Summary: '/summary',
  Account: '/account',
} as const;
export type RoutePath = (typeof RoutePath)[keyof typeof RoutePath];

export function inspectionDetailPath(id: string): string {
  return `/inspections/${id}`;
}

export function inspectionResolvePath(id: string): string {
  return `/inspections/${id}/resolve`;
}
