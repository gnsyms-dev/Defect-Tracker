export interface Plant {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly city: string;
  readonly state: string;
}

/** Label for the plant filter: code carries the identity, city the recognition. */
export function plantLabel(plant: Plant): string {
  return `${plant.code} — ${plant.city}`;
}
