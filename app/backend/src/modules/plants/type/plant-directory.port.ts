export const PLANT_DIRECTORY = Symbol('PLANT_DIRECTORY');

export interface PlantSummary {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

/**
 * The narrow, outward-facing slice of the plants module.
 *
 * Other modules (auth, for /auth/me's plant name; inspections, for the list and the
 * summary's byPlant breakdown) get exactly this and nothing more. Interface
 * Segregation: they have no reason to see `isActive` or a `findAllActive`, so they
 * are not handed a port that offers them.
 *
 * Batched by design -- a page of inspections resolves every plant it references in
 * one call rather than N.
 */
export interface PlantDirectoryPort {
  findSummariesByIds(ids: readonly string[]): Promise<readonly PlantSummary[]>;
}
