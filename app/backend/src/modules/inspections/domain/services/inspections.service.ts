import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
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
  private readonly logger = new Logger(InspectionsService.name);

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
      // Worth a warning rather than a debug line: a client sending someone
      // else's plantId is either a bug in the app or an attempt to write across
      // plants, and both are things you want to see without raising the level.
      this.logger.warn(
        `Log rejected reason=plant-not-owned userId=${user.id} userPlantId=${user.plantId} requestedPlantId=${input.plantId}`,
      );
      throw new ForbiddenException(InspectionErrorMessage.PlantNotOwned);
    }

    this.assertNotFutureDate(input.inspectionDate);
    this.assertRemarksPresentForOther(input.defectType, input.remarks);

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

    this.logger.log(
      `Inspection ${result.wasCreated ? 'created' : 'replayed'} id=${result.inspection.id} clientUuid=${input.clientUuid} userId=${user.id} plantId=${user.plantId} defectType=${input.defectType} severity=${input.severity} inspectionDate=${input.inspectionDate}`,
    );

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

    const scope = this.scopeFor(user);
    this.logger.debug(
      `Listing inspections userId=${user.id} scope=${InspectionsService.describeScope(scope)} page=${pagination.page} limit=${pagination.limit} sort=${sort.field}:${sort.direction} filters=[${InspectionsService.describeFilters(filters)}]`,
    );

    const page = await this.inspectionsRepository.findMany(
      scope,
      filters,
      sort,
      pagination,
    );

    this.logger.debug(
      `Listed inspections userId=${user.id} items=${page.items.length} total=${page.total}`,
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
      // "Not yours" and "does not exist" are one case to the caller, but the log
      // keeps the scope that produced the miss, which is what makes an
      // unexpected 404 diagnosable without reproducing it as that user.
      this.logger.warn(
        `Inspection not found id=${id} userId=${user.id} scope=${InspectionsService.describeScope(this.scopeFor(user))}`,
      );
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
      this.logger.log(
        `Inspection resolved id=${id} userId=${user.id} severity=${resolved.severity} plantId=${resolved.plantId}`,
      );
      const [item] = await this.decorate([resolved]);
      return item;
    }

    // The conditional UPDATE matched nothing, which means either the row is not
    // visible to this caller or someone else resolved it first. One lookup tells
    // those apart -- and the 409 is genuinely a conflict rather than a replay,
    // because only creates are ever replayed from the offline outbox.
    const existing = await this.inspectionsRepository.findById(scope, id);
    if (!existing) {
      this.logger.warn(
        `Resolve rejected reason=not-found id=${id} userId=${user.id} scope=${InspectionsService.describeScope(scope)}`,
      );
      throw new NotFoundException(InspectionErrorMessage.NotFound);
    }

    this.logger.warn(
      `Resolve rejected reason=already-resolved id=${id} userId=${user.id} resolvedByUserId=${existing.resolvedByUserId ?? 'unknown'}`,
    );
    throw new ConflictException(InspectionErrorMessage.AlreadyResolved);
  }

  async summarize(
    user: AuthenticatedUser,
    filters: InspectionFilters,
  ): Promise<InspectionSummary> {
    this.assertValidDateRange(filters);

    const scope = this.scopeFor(user);
    this.logger.debug(
      `Summarizing inspections userId=${user.id} scope=${InspectionsService.describeScope(scope)} filters=[${InspectionsService.describeFilters(filters)}]`,
    );

    const rows = await this.inspectionsRepository.summarize(scope, filters);

    const plantIds = [
      ...new Set(
        rows
          .filter((row) => row.plantId !== null)
          .map((row) => row.plantId as string),
      ),
    ];
    const plantsById = await this.loadPlants(plantIds);

    const summary: InspectionSummary = {
      totals: InspectionsService.pivotTotals(rows),
      bySeverity: InspectionsService.pivotBySeverity(rows),
      byPlant: InspectionsService.pivotByPlant(rows, plantsById),
    };

    this.logger.debug(
      `Summarized inspections userId=${user.id} open=${summary.totals.open} resolved=${summary.totals.resolved} plants=${summary.byPlant.length}`,
    );

    return summary;
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
    const today = InspectionsService.todayInPlantTimeZone();
    if (inspectionDate > today) {
      // Logged with both dates because the interesting failure is the one where
      // they differ only by the IST offset -- a device in another timezone, not
      // a user typing a future date.
      this.logger.warn(
        `Log rejected reason=future-date inspectionDate=${inspectionDate} plantToday=${today}`,
      );
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
      this.logger.warn('Log rejected reason=invalid-logged-at');
      throw new BadRequestException('loggedAt is not a valid timestamp.');
    }
    if (value < now - MAX_LOGGED_AT_AGE_MS) {
      this.logger.warn(
        `Log rejected reason=logged-at-too-old ageMs=${now - value} maxAgeMs=${MAX_LOGGED_AT_AGE_MS}`,
      );
      throw new UnprocessableEntityException(
        InspectionErrorMessage.LoggedAtTooOld,
      );
    }
    if (value > now + MAX_CLOCK_SKEW_MS) {
      // Clamping is silent to the client by design, so the log line is the only
      // place a fleet of fast device clocks becomes visible.
      this.logger.warn(
        `Clamped future loggedAt skewMs=${value - now} maxSkewMs=${MAX_CLOCK_SKEW_MS}`,
      );
      return new Date(now);
    }
    return loggedAt;
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
  private assertRemarksPresentForOther(
    defectType: DefectType,
    remarks: string | null,
  ): void {
    if (defectType === DefectType.Other && !remarks?.trim()) {
      this.logger.warn(
        `Log rejected reason=remarks-required-for-other defectType=${defectType}`,
      );
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
      this.logger.warn(
        `Query rejected reason=invalid-date-range dateFrom=${filters.dateFrom} dateTo=${filters.dateTo}`,
      );
      throw new BadRequestException(InspectionErrorMessage.InvalidDateRange);
    }
  }

  // ---------------------------------------------------------------------------
  // Log rendering
  // ---------------------------------------------------------------------------

  /**
   * Renders the effective scope for a log line. Printed on every scoped read so
   * an "I cannot see my own row" report can be answered from the logs alone.
   */
  private static describeScope(scope: InspectionScope): string {
    return scope.kind === 'own' ? `own:${scope.userId}` : 'all';
  }

  /**
   * Compact, log-safe rendering of the applied filters -- only the keys that are
   * actually set, so an unfiltered query stays a short line.
   */
  private static describeFilters(filters: InspectionFilters): string {
    const parts: string[] = [];
    if (filters.severities && filters.severities.length > 0) {
      parts.push(`severity=${filters.severities.join('|')}`);
    }
    if (filters.status) {
      parts.push(`status=${filters.status}`);
    }
    if (filters.defectTypes && filters.defectTypes.length > 0) {
      parts.push(`defectType=${filters.defectTypes.join('|')}`);
    }
    if (filters.dateFrom) {
      parts.push(`dateFrom=${filters.dateFrom}`);
    }
    if (filters.dateTo) {
      parts.push(`dateTo=${filters.dateTo}`);
    }
    if (filters.plantId) {
      parts.push(`plantId=${filters.plantId}`);
    }
    if (filters.machineLineId) {
      parts.push(`machineLineId=${filters.machineLineId}`);
    }
    return parts.join(' ');
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

    if (usersById.size < userIds.size || plants.size < plantIds.size) {
      // Every id here came off an inspection row's FK, so a shortfall means a
      // name will silently render as null on the list screen.
      this.logger.warn(
        `Directory lookup incomplete users=${usersById.size}/${userIds.size} plants=${plants.size}/${plantIds.size}`,
      );
    }

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
