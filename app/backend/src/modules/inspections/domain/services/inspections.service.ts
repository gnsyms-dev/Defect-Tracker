import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '@shared/types/authenticated-user.interface';
import { USER_DIRECTORY } from '@modules/auth/type/user-directory.port';
import type {
  UserDirectoryPort,
  UserSummary,
} from '@modules/auth/type/user-directory.port';
import { PLANT_DIRECTORY } from '@modules/plants/type/plant-directory.port';
import type {
  PlantDirectoryPort,
  PlantSummary,
} from '@modules/plants/type/plant-directory.port';
import { InspectionEntity } from '../entities/inspection.entity';
import {
  MAX_CLOCK_SKEW_MS,
  MAX_LOGGED_AT_AGE_MS,
  PLANT_TIME_ZONE,
} from '../../type/inspection.constants';
import type {
  InspectionFilters,
  InspectionSort,
  Page,
  Pagination,
} from '../../type/inspection-filters.interface';
import type { InspectionListItem } from '../../type/inspection-list-item.interface';
import { scopeForUser } from '../../type/inspection-scope.type';
import type { InspectionScope } from '../../type/inspection-scope.type';
import type { InspectionSummaryRow } from '../../type/inspection-summary-row.interface';
import type {
  InspectionSummary,
  PlantSummaryCounts,
  SeveritySummary,
  SummaryCounts,
} from '../../type/inspection-summary.interface';
import {
  DefectType,
  SEVERITY_DISPLAY_ORDER,
  InspectionStatus,
  Severity,
} from '../../type/inspection.enum';
import { InspectionErrorMessage } from '../../type/inspection.error.message';
import { INSPECTIONS_REPOSITORY } from '../../type/inspections-repository.port';
import type {
  CreateInspectionResult,
  InspectionsRepositoryPort,
} from '../../type/inspections-repository.port';

export interface LogInspectionInput {
  readonly clientUuid: string;
  readonly inspectionDate: string;
  readonly machineLineId: string;
  readonly defectType: DefectType;
  readonly severity: Severity;
  readonly remarks: string | null;
  readonly loggedAt: Date;
  /** Optional and validated against the caller's own plant; never trusted blindly. */
  readonly plantId?: string;
}

export interface LoggedInspectionResult {
  readonly item: InspectionListItem;
  readonly wasCreated: boolean;
}

@Injectable()
export class InspectionsService {
  constructor(
    @Inject(INSPECTIONS_REPOSITORY)
    private readonly inspectionsRepository: InspectionsRepositoryPort,
    @Inject(USER_DIRECTORY)
    private readonly userDirectory: UserDirectoryPort,
    @Inject(PLANT_DIRECTORY)
    private readonly plantDirectory: PlantDirectoryPort,
  ) {}

  async log(
    user: AuthenticatedUser,
    input: LogInspectionInput,
  ): Promise<LoggedInspectionResult> {
    // plant_id is the historical fact of WHERE the defect occurred, so it is taken
    // from the logging user rather than read at display time from their current
    // plant -- a supervisor transferring plants must not retroactively move their
    // past inspections. A supplied plantId is only ever allowed to confirm the
    // caller's own plant.
    if (input.plantId && input.plantId !== user.plantId) {
      throw new ForbiddenException(InspectionErrorMessage.PlantNotOwned);
    }

    this.assertNotFutureDate(input.inspectionDate);
    InspectionsService.assertRemarksPresentForOther(
      input.defectType,
      input.remarks,
    );

    const result: CreateInspectionResult =
      await this.inspectionsRepository.createIfAbsent({
        clientUuid: input.clientUuid,
        plantId: user.plantId,
        loggedByUserId: user.id,
        inspectionDate: input.inspectionDate,
        machineLineId: input.machineLineId.trim(),
        defectType: input.defectType,
        severity: input.severity,
        remarks: input.remarks,
        loggedAt: this.clampLoggedAt(input.loggedAt),
      });

    const [item] = await this.decorate([result.inspection]);
    return { item, wasCreated: result.wasCreated };
  }

  async list(
    user: AuthenticatedUser,
    filters: InspectionFilters,
    sort: InspectionSort,
    pagination: Pagination,
  ): Promise<Page<InspectionListItem>> {
    this.assertValidDateRange(filters);

    const page = await this.inspectionsRepository.findMany(
      this.scopeFor(user),
      filters,
      sort,
      pagination,
    );

    return { items: await this.decorate(page.items), total: page.total };
  }

  async getById(
    user: AuthenticatedUser,
    id: string,
  ): Promise<InspectionListItem> {
    const inspection = await this.inspectionsRepository.findById(
      this.scopeFor(user),
      id,
    );

    // 404 rather than 403 for an out-of-scope row: the scope is part of the WHERE,
    // so "not yours" and "does not exist" are indistinguishable here by design --
    // a 403 would confirm the row exists.
    if (!inspection) {
      throw new NotFoundException(InspectionErrorMessage.NotFound);
    }

    const [item] = await this.decorate([inspection]);
    return item;
  }

  async resolve(
    user: AuthenticatedUser,
    id: string,
    resolutionNote: string,
  ): Promise<InspectionListItem> {
    const scope = this.scopeFor(user);

    const resolved = await this.inspectionsRepository.resolveIfOpen(scope, id, {
      resolutionNote: resolutionNote.trim(),
      resolvedByUserId: user.id,
      resolvedAt: new Date(),
    });

    if (resolved) {
      const [item] = await this.decorate([resolved]);
      return item;
    }

    // The conditional UPDATE matched nothing, which means either the row is not
    // visible to this caller or someone else resolved it first. One lookup tells
    // those apart -- and the 409 is genuinely a conflict rather than a replay,
    // because only creates are ever replayed from the offline outbox.
    const existing = await this.inspectionsRepository.findById(scope, id);
    if (!existing) {
      throw new NotFoundException(InspectionErrorMessage.NotFound);
    }
    throw new ConflictException(InspectionErrorMessage.AlreadyResolved);
  }

  async summarize(
    user: AuthenticatedUser,
    filters: InspectionFilters,
  ): Promise<InspectionSummary> {
    this.assertValidDateRange(filters);

    const rows = await this.inspectionsRepository.summarize(
      this.scopeFor(user),
      filters,
    );

    const plantIds = [
      ...new Set(
        rows
          .filter((row) => row.plantId !== null)
          .map((row) => row.plantId as string),
      ),
    ];
    const plantsById = await this.loadPlants(plantIds);

    return {
      totals: InspectionsService.pivotTotals(rows),
      bySeverity: InspectionsService.pivotBySeverity(rows),
      byPlant: InspectionsService.pivotByPlant(rows, plantsById),
    };
  }

  // ---------------------------------------------------------------------------
  // Authorization
  // ---------------------------------------------------------------------------

  private scopeFor(user: AuthenticatedUser): InspectionScope {
    // Derived from the authenticated user only. `loggedByUserId` is not a field on
    // any query DTO, so there is nothing for a supervisor to forge -- and because
    // every repository read takes the scope as a required first parameter, an
    // unscoped query would not compile.
    return scopeForUser(user);
  }

  // ---------------------------------------------------------------------------
  // Date and clock rules
  // ---------------------------------------------------------------------------

  /**
   * Rejects a date after today *in plant-local time*.
   *
   * This cannot be a database CHECK constraint: Postgres refuses non-IMMUTABLE
   * functions such as current_date inside CHECK. And it has to be IST-relative --
   * comparing against a UTC "today" would reject a legitimate 09:00 IST entry for
   * the first 5.5 hours of every day.
   *
   * No lower bound: entering a paper backlog is a legitimate use of this tool.
   */
  private assertNotFutureDate(inspectionDate: string): void {
    if (inspectionDate > InspectionsService.todayInPlantTimeZone()) {
      throw new UnprocessableEntityException(InspectionErrorMessage.FutureDate);
    }
  }

  /**
   * `logged_at` is a device clock and therefore untrusted.
   *
   * Forward skew is clamped rather than rejected: a phone running a few minutes
   * fast should not fail to record a defect, but it must not create rows dated in
   * the future either. A wildly stale value is a broken clock rather than a
   * backlog, so that is rejected outright.
   */
  private clampLoggedAt(loggedAt: Date): Date {
    const now = Date.now();
    const value = loggedAt.getTime();

    if (Number.isNaN(value)) {
      throw new BadRequestException('loggedAt is not a valid timestamp.');
    }
    if (value < now - MAX_LOGGED_AT_AGE_MS) {
      throw new UnprocessableEntityException(
        InspectionErrorMessage.LoggedAtTooOld,
      );
    }
    return value > now + MAX_CLOCK_SKEW_MS ? new Date(now) : loggedAt;
  }

  /**
   * "Other" is an escape hatch, and an escape hatch with no explanation produces
   * data nobody can act on -- so remarks are mandatory for it.
   *
   * Enforced here rather than on the DTO because @IsOptional() causes
   * class-validator to skip every other validator on the property when the value
   * is absent, which silently disables a @ValidateIf/@IsNotEmpty pair beside it.
   * The matching DB CHECK stays as the backstop, but this is what turns the case
   * into a clean 400 instead of a constraint violation surfacing as a 500.
   */
  private static assertRemarksPresentForOther(
    defectType: DefectType,
    remarks: string | null,
  ): void {
    if (defectType === DefectType.Other && !remarks?.trim()) {
      throw new BadRequestException(
        InspectionErrorMessage.RemarksRequiredForOther,
      );
    }
  }

  private assertValidDateRange(filters: InspectionFilters): void {
    if (
      filters.dateFrom &&
      filters.dateTo &&
      filters.dateFrom > filters.dateTo
    ) {
      throw new BadRequestException(InspectionErrorMessage.InvalidDateRange);
    }
  }

  /** `en-CA` yields YYYY-MM-DD directly, so no manual formatting is needed. */
  private static todayInPlantTimeZone(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: PLANT_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  // ---------------------------------------------------------------------------
  // Read-model assembly
  // ---------------------------------------------------------------------------

  /**
   * Attaches display names, using ONE batched call per directory for the whole
   * page rather than a lookup per row.
   */
  private async decorate(
    inspections: readonly InspectionEntity[],
  ): Promise<InspectionListItem[]> {
    if (inspections.length === 0) {
      return [];
    }

    const userIds = new Set<string>();
    const plantIds = new Set<string>();
    for (const inspection of inspections) {
      userIds.add(inspection.loggedByUserId);
      if (inspection.resolvedByUserId) {
        userIds.add(inspection.resolvedByUserId);
      }
      plantIds.add(inspection.plantId);
    }

    const [users, plants] = await Promise.all([
      this.userDirectory.findSummariesByIds([...userIds]),
      this.loadPlants([...plantIds]),
    ]);

    const usersById = new Map<string, UserSummary>(
      users.map((user) => [user.id, user]),
    );

    return inspections.map((inspection) => ({
      inspection,
      loggedBy: usersById.get(inspection.loggedByUserId) ?? null,
      resolvedBy: inspection.resolvedByUserId
        ? (usersById.get(inspection.resolvedByUserId) ?? null)
        : null,
      plant: plants.get(inspection.plantId) ?? null,
    }));
  }

  private async loadPlants(
    plantIds: readonly string[],
  ): Promise<Map<string, PlantSummary>> {
    const plants = await this.plantDirectory.findSummariesByIds(plantIds);
    return new Map(plants.map((plant) => [plant.id, plant]));
  }

  // ---------------------------------------------------------------------------
  // Summary pivoting
  // ---------------------------------------------------------------------------

  private static countsFrom(
    rows: readonly InspectionSummaryRow[],
  ): SummaryCounts {
    const open = rows
      .filter((row) => row.status === InspectionStatus.Open)
      .reduce((sum, row) => sum + row.count, 0);
    const resolved = rows
      .filter((row) => row.status === InspectionStatus.Resolved)
      .reduce((sum, row) => sum + row.count, 0);
    return { open, resolved, total: open + resolved };
  }

  private static pivotTotals(
    rows: readonly InspectionSummaryRow[],
  ): SummaryCounts {
    // The per-status grouping set: status present, both breakdown columns null.
    return InspectionsService.countsFrom(
      rows.filter(
        (row) =>
          row.status !== null && row.severity === null && row.plantId === null,
      ),
    );
  }

  private static pivotBySeverity(
    rows: readonly InspectionSummaryRow[],
  ): readonly SeveritySummary[] {
    const severityRows = rows.filter((row) => row.severity !== null);

    // Iterating the fixed display order (rather than the rows) is what guarantees
    // all three severities are present even when a cell has no rows at all.
    return SEVERITY_DISPLAY_ORDER.map((severity) => ({
      severity,
      ...InspectionsService.countsFrom(
        severityRows.filter((row) => row.severity === severity),
      ),
    }));
  }

  private static pivotByPlant(
    rows: readonly InspectionSummaryRow[],
    plantsById: Map<string, PlantSummary>,
  ): readonly PlantSummaryCounts[] {
    const plantRows = rows.filter((row) => row.plantId !== null);
    const plantIds = [
      ...new Set(plantRows.map((row) => row.plantId as string)),
    ];

    return (
      plantIds
        .map((plantId) => ({
          plantId,
          plant: plantsById.get(plantId) ?? null,
          ...InspectionsService.countsFrom(
            plantRows.filter((row) => row.plantId === plantId),
          ),
        }))
        // Stable, meaningful order: most open defects first, then by code.
        .sort(
          (a, b) =>
            b.open - a.open ||
            (a.plant?.code ?? '').localeCompare(b.plant?.code ?? ''),
        )
    );
  }
}
