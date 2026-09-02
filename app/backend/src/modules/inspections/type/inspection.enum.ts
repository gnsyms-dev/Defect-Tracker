/**
 * Severity is the one field backed by a native Postgres enum, declared
 * least -> most severe so `ORDER BY severity DESC` is worst-first and
 * `severity >= 'major'` is a real predicate. Keep this order in sync with the
 * CREATE TYPE in the inspections migration.
 */
export enum Severity {
  Minor = 'minor',
  Major = 'major',
  Critical = 'critical',
}

/** Presentation order for the summary, decided server-side so no client sorts these strings alphabetically. */
export const SEVERITY_DISPLAY_ORDER: readonly Severity[] = [
  Severity.Critical,
  Severity.Major,
  Severity.Minor,
];

// Stored as varchar + CHECK, not a native enum: the list will be driven by plant
// managers rather than developers, and a Postgres enum can never have a value
// removed. Values are codes, never display labels, so translated labels need no
// migration.
export enum DefectType {
  WeaveDefect = 'weave_defect',
  ShadeVariation = 'shade_variation',
  HoleTear = 'hole_tear',
  CountDeviation = 'count_deviation',
  Other = 'other',
}

export enum InspectionStatus {
  Open = 'open',
  Resolved = 'resolved',
}

/**
 * The sort whitelist. This is not ceremony: `sortBy` flows into a Sequelize
 * `order` clause, and while Sequelize quotes identifiers, (a) `order: [literal(...)]`
 * is injectable and is what the next person reaches for, (b) an unwhitelisted
 * column would let a client order by a joined table's password_hash and infer data
 * from the ordering, and (c) sorting by an unindexed column on a growing table is a
 * free denial of service.
 */
export enum InspectionSortField {
  InspectionDate = 'inspectionDate',
  CreatedAt = 'createdAt',
  Severity = 'severity',
}

export enum SortDirection {
  Asc = 'asc',
  Desc = 'desc',
}
