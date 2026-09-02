// Naming note: the module is `plants` (plural, matching the table and the route),
// but a single record is a Plant. Entity/model/mapper are therefore singular while
// the module/service/controller are plural -- a small, deliberate readability
// deviation from a literal reading of the module-scaffold convention.
export class PlantEntity {
  constructor(
    public readonly id: string,
    public readonly code: string,
    public readonly name: string,
    public readonly city: string,
    public readonly state: string,
    public readonly isActive: boolean,
  ) {}
}
