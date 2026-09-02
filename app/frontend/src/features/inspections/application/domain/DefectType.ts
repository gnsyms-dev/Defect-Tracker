export const DefectType = {
  WeaveDefect: 'weave_defect',
  ShadeVariation: 'shade_variation',
  HoleTear: 'hole_tear',
  CountDeviation: 'count_deviation',
  Other: 'other',
} as const;
export type DefectType = (typeof DefectType)[keyof typeof DefectType];

/**
 * Display labels live here, not in the database.
 *
 * The API stores snake_case CODES, which is what lets Gujarati or Marathi labels be
 * added later with no migration.
 */
export const DEFECT_TYPE_LABELS: Readonly<Record<DefectType, string>> = {
  [DefectType.WeaveDefect]: 'Weave Defect',
  [DefectType.ShadeVariation]: 'Shade Variation',
  [DefectType.HoleTear]: 'Hole / Tear',
  [DefectType.CountDeviation]: 'Count Deviation',
  [DefectType.Other]: 'Other',
};

/** Dropdown order, matching the order given in the brief. */
export const DEFECT_TYPE_ORDER: readonly DefectType[] = [
  DefectType.WeaveDefect,
  DefectType.ShadeVariation,
  DefectType.HoleTear,
  DefectType.CountDeviation,
  DefectType.Other,
];

export const DEFECT_TYPE_OPTIONS = DEFECT_TYPE_ORDER.map((value) => ({
  value,
  label: DEFECT_TYPE_LABELS[value],
}));
