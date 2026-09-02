import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { col, fn, literal, Op, UniqueConstraintError } from 'sequelize';
import type { GroupOption, Order, WhereOptions } from 'sequelize';
import { InspectionEntity } from '../../../../domain/entities/inspection.entity';
import type {
  InspectionFilters,
  InspectionSort,
  Page,
  Pagination,
} from '../../../../type/inspection-filters.interface';
import type { InspectionScope } from '../../../../type/inspection-scope.type';
import type { InspectionSummaryRow } from '../../../../type/inspection-summary-row.interface';
import {
  InspectionSortField,
  InspectionStatus,
  Severity,
  SortDirection,
} from '../../../../type/inspection.enum';
import type {
  CreateInspectionData,
  CreateInspectionResult,
  InspectionsRepositoryPort,
  ResolveInspectionData,
} from '../../../../type/inspections-repository.port';
import { InspectionPersistenceMapper } from '../mapper/inspection-persistence.mapper';
import { InspectionModel } from '../models/inspection.model';

/**
 * Maps the whitelisted sort field to a real model attribute. Nothing from the
 * request ever reaches Sequelize's `order` as a raw string.
 */
const SORT_ATTRIBUTE: Readonly<Record<InspectionSortField, string>> = {
  [InspectionSortField.InspectionDate]: 'inspectionDate',
  [InspectionSortField.CreatedAt]: 'createdAt',
  [InspectionSortField.Severity]: 'severity',
};

/**
 * The GROUP BY for the summary aggregation.
 *
 * It has to be a `literal`: Sequelize quotes a bare string group value as a column
 * identifier, which would emit `GROUP BY "GROUPING SETS (...)"` and fail. The cast
 * is a gap in sequelize 6's own typings -- `GroupOption` is declared as
 * `string | Fn | Col` and omits `Literal`, even though `Literal` is precisely what
 * its query generator renders verbatim. This is not forcing an unrelated shape into
 * place; the value is exactly what the generator expects at runtime, and the
 * accompanying test asserts the emitted SQL.
 */
const GROUPING_SETS = literal(
  'GROUPING SETS (("status", "severity"), ("status", "plant_id"), ("status"), ())',
) as unknown as GroupOption;

interface RawSummaryRow {
  readonly status: string | null;
  readonly severity: string | null;
  readonly plantId: string | null;
  readonly count: string | number;
}

@Injectable()
export class InspectionsRepository implements InspectionsRepositoryPort {
  private readonly logger = new Logger(InspectionsRepository.name);

  constructor(
    @InjectModel(InspectionModel)
    private readonly inspectionModel: typeof InspectionModel,
  ) {}

  async createIfAbsent(
    data: CreateInspectionData,
  ): Promise<CreateInspectionResult> {
    try {
      const created = await this.inspectionModel.create({
        clientUuid: data.clientUuid,
        plantId: data.plantId,
        loggedByUserId: data.loggedByUserId,
        inspectionDate: data.inspectionDate,
        machineLineId: data.machineLineId,
        defectType: data.defectType,
        severity: data.severity,
        remarks: data.remarks,
        loggedAt: data.loggedAt,
      });
      this.logger.debug(
        `createIfAbsent outcome=inserted id=${created.id} clientUuid=${data.clientUuid}`,
      );

      return {
        inspection: InspectionPersistenceMapper.toDomain(created),
        wasCreated: true,
      };
    } catch (err) {
      // The replay path, and deliberately the PRIMARY mechanism rather than a
      // fallback. A SELECT-then-INSERT would cost two round-trips on the happy
      // path and would still hit this unique violation under concurrent replays
      // (two flushes both see "not found" under READ COMMITTED) -- so the conflict
      // has to be handled either way. Handling it here keeps the happy path a
      // single plain INSERT.
      if (!(err instanceof UniqueConstraintError)) {
        // Logged here rather than left to the global filter alone, because this
        // is the only place that still knows which write failed and for whom.
        this.logger.error(
          `createIfAbsent failed clientUuid=${data.clientUuid} loggedByUserId=${data.loggedByUserId}`,
          err instanceof Error ? err.stack : String(err),
        );
        throw err;
      }

      const existing = await this.inspectionModel.findOne({
        where: {
          loggedByUserId: data.loggedByUserId,
          clientUuid: data.clientUuid,
        },
      });

      // A unique violation with nothing to find would mean a different constraint
      // fired; rethrowing keeps that from being silently swallowed as a replay.
      if (!existing) {
        this.logger.error(
          `createIfAbsent hit an unexpected unique violation clientUuid=${data.clientUuid} loggedByUserId=${data.loggedByUserId} fields=${Object.keys(err.fields).join('|')}`,
        );
        throw err;
      }

      this.logger.debug(
        `createIfAbsent outcome=replayed id=${existing.id} clientUuid=${data.clientUuid}`,
      );

      return {
        inspection: InspectionPersistenceMapper.toDomain(existing),
        wasCreated: false,
      };
    }
  }

  async findMany(
    scope: InspectionScope,
    filters: InspectionFilters,
    sort: InspectionSort,
    pagination: Pagination,
  ): Promise<Page<InspectionEntity>> {
    const startedAt = Date.now();
    const { rows, count } = await this.inspectionModel.findAndCountAll({
      where: InspectionsRepository.buildWhere(scope, filters),
      order: InspectionsRepository.buildOrder(sort),
      limit: pagination.limit,
      offset: (pagination.page - 1) * pagination.limit,
    });

    this.logger.debug(
      `findMany rows=${rows.length} total=${count} page=${pagination.page} limit=${pagination.limit} +${Date.now() - startedAt}ms`,
    );

    return {
      items: rows.map((row) => InspectionPersistenceMapper.toDomain(row)),
      total: count,
    };
  }

  async findById(
    scope: InspectionScope,
    id: string,
  ): Promise<InspectionEntity | null> {
    // The scope is folded into the WHERE rather than checked after loading, so an
    // out-of-scope row is indistinguishable from a missing one. That is what lets
    // the service answer 404 instead of 403 and avoid confirming the row exists.
    const row = await this.inspectionModel.findOne({
      where: { ...InspectionsRepository.buildWhere(scope, {}), id },
    });

    this.logger.debug(
      `findById id=${id} scope=${scope.kind} result=${row ? 'hit' : 'miss'}`,
    );

    return row ? InspectionPersistenceMapper.toDomain(row) : null;
  }

  async summarize(
    scope: InspectionScope,
    filters: InspectionFilters,
  ): Promise<readonly InspectionSummaryRow[]> {
    // ONE round trip for four breakdowns: severity x status, plant x status,
    // per-status totals, and (from the empty grouping set) the grand total.
    //
    // Reusing buildWhere with findMany is the point: it is what guarantees the
    // summary can never disagree with the list it sits above, which is the single
    // most common source of "the numbers don't match" bug reports.
    const startedAt = Date.now();
    const rows = await this.inspectionModel.findAll({
      attributes: [
        'status',
        'severity',
        'plantId',
        [fn('COUNT', col('id')), 'count'],
      ],
      where: InspectionsRepository.buildWhere(scope, filters),
      group: GROUPING_SETS,
      raw: true,
    });

    this.logger.debug(
      `summarize groupedRows=${rows.length} scope=${scope.kind} +${Date.now() - startedAt}ms`,
    );

    return (rows as unknown as readonly RawSummaryRow[]).map((row) =>
      InspectionsRepository.toSummaryRow(row),
    );
  }

  async resolveIfOpen(
    scope: InspectionScope,
    id: string,
    data: ResolveInspectionData,
  ): Promise<InspectionEntity | null> {
    // Conditional UPDATE rather than read-modify-write: `status: Open` in the WHERE
    // lets the database arbitrate a race between two QA managers without
    // SERIALIZABLE or an explicit row lock. Zero affected rows means either the row
    // is gone/out of scope or someone else resolved it first -- the service then
    // does one lookup to tell 404 from 409.
    const [, updatedRows] = await this.inspectionModel.update(
      {
        status: InspectionStatus.Resolved,
        resolutionNote: data.resolutionNote,
        resolvedByUserId: data.resolvedByUserId,
        resolvedAt: data.resolvedAt,
      },
      {
        where: {
          ...InspectionsRepository.buildWhere(scope, {}),
          id,
          status: InspectionStatus.Open,
        },
        returning: true,
      },
    );

    const updated = updatedRows?.[0];

    // outcome=no-op is not an error at this layer -- the service turns it into a
    // 404 or a 409 -- but it is the half of the race that leaves no other trace.
    this.logger.debug(
      `resolveIfOpen id=${id} scope=${scope.kind} outcome=${updated ? 'resolved' : 'no-op'}`,
    );

    return updated ? InspectionPersistenceMapper.toDomain(updated) : null;
  }

  /**
   * The single source of truth for "which rows may this caller see, narrowed by
   * these filters". Shared by findMany, findById, summarize and resolveIfOpen.
   */
  private static buildWhere(
    scope: InspectionScope,
    filters: InspectionFilters,
  ): WhereOptions<InferedAttributes> {
    const where: Record<string, unknown> = {};

    // Scope first, and unconditionally.
    if (scope.kind === 'own') {
      where.loggedByUserId = scope.userId;
    }

    if (filters.severities && filters.severities.length > 0) {
      where.severity = { [Op.in]: [...filters.severities] };
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.defectTypes && filters.defectTypes.length > 0) {
      where.defectType = { [Op.in]: [...filters.defectTypes] };
    }
    if (filters.plantId) {
      where.plantId = filters.plantId;
    }
    if (filters.machineLineId) {
      // iLike is Postgres-specific and case-insensitive. Unindexed on purpose:
      // it always runs after the scope filter, so it filters hundreds of rows
      // rather than scanning the table.
      where.machineLineId = { [Op.iLike]: `%${filters.machineLineId}%` };
    }

    // Inclusive on both ends. Safe to compare as plain strings because the column
    // is DATE and 'YYYY-MM-DD' sorts lexicographically the same as it does
    // chronologically -- no timezone conversion anywhere in this path.
    if (filters.dateFrom && filters.dateTo) {
      where.inspectionDate = {
        [Op.between]: [filters.dateFrom, filters.dateTo],
      };
    } else if (filters.dateFrom) {
      where.inspectionDate = { [Op.gte]: filters.dateFrom };
    } else if (filters.dateTo) {
      where.inspectionDate = { [Op.lte]: filters.dateTo };
    }

    return where;
  }

  private static buildOrder(sort: InspectionSort): Order {
    const direction =
      sort.direction === SortDirection.Asc ? 'ASC' : ('DESC' as const);
    const attribute = SORT_ATTRIBUTE[sort.field];

    // Tiebreakers are not optional. Without them, OFFSET pagination over a
    // non-unique sort key (every one of ours) silently duplicates and skips rows
    // across pages -- which reads as data corruption and is the hardest
    // pagination bug to reproduce.
    return [
      [attribute, direction],
      ['createdAt', direction],
      ['id', 'ASC'],
    ];
  }

  private static toSummaryRow(row: RawSummaryRow): InspectionSummaryRow {
    return {
      status: (row.status as InspectionStatus | null) ?? null,
      severity: (row.severity as Severity | null) ?? null,
      plantId: row.plantId ?? null,
      // COUNT(*) comes back as a string from the pg driver on bigint columns.
      count: Number(row.count),
    };
  }
}

// Local alias so the WhereOptions generic stays readable above.
type InferedAttributes = InspectionModel;
