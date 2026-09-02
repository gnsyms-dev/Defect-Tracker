// Instantiated directly rather than via @nestjs/testing -- see the note in
// src/app.controller.spec.ts for why (Nest 12 is ESM-only).
import { Op, UniqueConstraintError } from 'sequelize';
import {
  InspectionSortField,
  InspectionStatus,
  Severity,
  SortDirection,
} from '../../../../type/inspection.enum';
import { InspectionModel } from '../models/inspection.model';
import { InspectionsRepository } from './inspections.repository';

interface ModelMock {
  create: jest.Mock;
  findOne: jest.Mock;
  findAll: jest.Mock;
  findAndCountAll: jest.Mock;
  update: jest.Mock;
}

const storedRow = {
  id: 'insp-1',
  clientUuid: 'client-1',
  plantId: 'plant-1',
  loggedByUserId: 'sup-1',
  inspectionDate: '2026-09-01',
  machineLineId: 'LOOMA-004',
  defectType: 'weave_defect',
  severity: 'major',
  status: 'open',
  remarks: null,
  resolutionNote: null,
  resolvedByUserId: null,
  resolvedAt: null,
  loggedAt: new Date('2026-09-01T09:00:00Z'),
  createdAt: new Date('2026-09-01T09:00:05Z'),
  updatedAt: new Date('2026-09-01T09:00:05Z'),
};

const createData = {
  clientUuid: 'client-1',
  plantId: 'plant-1',
  loggedByUserId: 'sup-1',
  inspectionDate: '2026-09-01',
  machineLineId: 'LOOMA-004',
  defectType: storedRow.defectType as never,
  severity: storedRow.severity as never,
  remarks: null,
  loggedAt: storedRow.loggedAt,
};

describe('InspectionsRepository', () => {
  let inspectionsRepository: InspectionsRepository;
  let inspectionModel: ModelMock;

  beforeEach(() => {
    inspectionModel = {
      create: jest.fn().mockResolvedValue(storedRow),
      findOne: jest.fn().mockResolvedValue(null),
      findAll: jest.fn().mockResolvedValue([]),
      findAndCountAll: jest.fn().mockResolvedValue({ rows: [], count: 0 }),
      update: jest.fn().mockResolvedValue([0, []]),
    };
    inspectionsRepository = new InspectionsRepository(
      inspectionModel as unknown as typeof InspectionModel,
    );
  });

  describe('createIfAbsent (offline idempotency)', () => {
    it('inserts and reports wasCreated: true on the happy path', async () => {
      const result = await inspectionsRepository.createIfAbsent(createData);

      expect(result.wasCreated).toBe(true);
      expect(result.inspection.id).toBe('insp-1');
      // A single plain INSERT -- no pre-flight SELECT on the common path.
      expect(inspectionModel.findOne).not.toHaveBeenCalled();
    });

    it('returns the stored row with wasCreated: false when the unique key already exists', async () => {
      inspectionModel.create.mockRejectedValue(
        new UniqueConstraintError({ errors: [] }),
      );
      inspectionModel.findOne.mockResolvedValue(storedRow);

      const result = await inspectionsRepository.createIfAbsent(createData);

      expect(result.wasCreated).toBe(false);
      expect(result.inspection.id).toBe('insp-1');
      // Looked up by the composite key, so a replay can never resolve to another
      // user's row.
      const [options] = inspectionModel.findOne.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      expect(options.where).toEqual({
        loggedByUserId: 'sup-1',
        clientUuid: 'client-1',
      });
    });

    it('rethrows a unique violation that is NOT the idempotency key', async () => {
      // If some other unique constraint fired, swallowing it as a replay would
      // silently return the wrong record (or nothing).
      const err = new UniqueConstraintError({ errors: [] });
      inspectionModel.create.mockRejectedValue(err);
      inspectionModel.findOne.mockResolvedValue(null);

      await expect(
        inspectionsRepository.createIfAbsent(createData),
      ).rejects.toBe(err);
    });

    it('rethrows any non-unique database error untouched', async () => {
      const err = new Error('connection terminated');
      inspectionModel.create.mockRejectedValue(err);

      await expect(
        inspectionsRepository.createIfAbsent(createData),
      ).rejects.toBe(err);
      expect(inspectionModel.findOne).not.toHaveBeenCalled();
    });
  });

  describe('scoping', () => {
    it('adds loggedByUserId to the WHERE for the own scope', async () => {
      await inspectionsRepository.findMany(
        { kind: 'own', userId: 'sup-1' },
        {},
        {
          field: InspectionSortField.InspectionDate,
          direction: SortDirection.Desc,
        },
        { page: 1, limit: 20 },
      );

      const [options] = inspectionModel.findAndCountAll.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      expect(options.where.loggedByUserId).toBe('sup-1');
    });

    it('omits loggedByUserId entirely for the all scope', async () => {
      await inspectionsRepository.findMany(
        { kind: 'all' },
        {},
        {
          field: InspectionSortField.InspectionDate,
          direction: SortDirection.Desc,
        },
        { page: 1, limit: 20 },
      );

      const [options] = inspectionModel.findAndCountAll.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      expect(options.where).not.toHaveProperty('loggedByUserId');
    });

    it('scopes findById through the WHERE, so out-of-scope is indistinguishable from missing', async () => {
      await inspectionsRepository.findById(
        { kind: 'own', userId: 'sup-1' },
        'insp-9',
      );

      const [options] = inspectionModel.findOne.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      expect(options.where).toEqual({ loggedByUserId: 'sup-1', id: 'insp-9' });
    });
  });

  describe('sorting and pagination', () => {
    it.each([
      [InspectionSortField.InspectionDate, 'inspectionDate'],
      [InspectionSortField.CreatedAt, 'createdAt'],
      [InspectionSortField.Severity, 'severity'],
    ])(
      'maps the whitelisted field %s to the attribute %s',
      async (field, attribute) => {
        await inspectionsRepository.findMany(
          { kind: 'all' },
          {},
          { field, direction: SortDirection.Desc },
          { page: 1, limit: 20 },
        );

        const [options] = inspectionModel.findAndCountAll.mock.calls[0] as [
          { order: [string, string][] },
        ];
        expect(options.order[0][0]).toBe(attribute);
      },
    );

    it('always appends createdAt and id tiebreakers', async () => {
      // Without these, OFFSET paging over a non-unique sort key silently
      // duplicates and skips rows across pages.
      await inspectionsRepository.findMany(
        { kind: 'all' },
        {},
        { field: InspectionSortField.Severity, direction: SortDirection.Desc },
        { page: 1, limit: 20 },
      );

      const [options] = inspectionModel.findAndCountAll.mock.calls[0] as [
        { order: [string, string][] },
      ];
      expect(options.order.map((entry) => entry[0])).toEqual([
        'severity',
        'createdAt',
        'id',
      ]);
    });

    it('translates page/limit into limit/offset', async () => {
      await inspectionsRepository.findMany(
        { kind: 'all' },
        {},
        {
          field: InspectionSortField.InspectionDate,
          direction: SortDirection.Desc,
        },
        { page: 3, limit: 20 },
      );

      const [options] = inspectionModel.findAndCountAll.mock.calls[0] as [
        { limit: number; offset: number },
      ];
      expect(options).toMatchObject({ limit: 20, offset: 40 });
    });
  });

  describe('filters', () => {
    it('builds an inclusive BETWEEN when both dates are given', async () => {
      await inspectionsRepository.findMany(
        { kind: 'all' },
        { dateFrom: '2026-08-01', dateTo: '2026-09-01' },
        {
          field: InspectionSortField.InspectionDate,
          direction: SortDirection.Desc,
        },
        { page: 1, limit: 20 },
      );

      const [options] = inspectionModel.findAndCountAll.mock.calls[0] as [
        { where: { inspectionDate: Record<symbol, unknown> } },
      ];
      // Sequelize operators are Symbol keys, so this has to be read via Op.between
      // rather than Object.values(), which only enumerates string keys.
      expect(options.where.inspectionDate[Op.between]).toEqual([
        '2026-08-01',
        '2026-09-01',
      ]);
    });

    it('uses a one-sided comparison when only dateFrom is given', async () => {
      await inspectionsRepository.findMany(
        { kind: 'all' },
        { dateFrom: '2026-08-01' },
        {
          field: InspectionSortField.InspectionDate,
          direction: SortDirection.Desc,
        },
        { page: 1, limit: 20 },
      );

      const [options] = inspectionModel.findAndCountAll.mock.calls[0] as [
        { where: { inspectionDate: Record<symbol, unknown> } },
      ];
      expect(options.where.inspectionDate[Op.gte]).toBe('2026-08-01');
      expect(options.where.inspectionDate[Op.between]).toBeUndefined();
    });

    it('ignores an empty severity array rather than emitting IN ()', async () => {
      await inspectionsRepository.findMany(
        { kind: 'all' },
        { severities: [] },
        {
          field: InspectionSortField.InspectionDate,
          direction: SortDirection.Desc,
        },
        { page: 1, limit: 20 },
      );

      const [options] = inspectionModel.findAndCountAll.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      expect(options.where).not.toHaveProperty('severity');
    });
  });

  describe('resolveIfOpen', () => {
    it('constrains the UPDATE to rows still open, letting the DB arbitrate races', async () => {
      inspectionModel.update.mockResolvedValue([1, [storedRow]]);

      await inspectionsRepository.resolveIfOpen({ kind: 'all' }, 'insp-1', {
        resolutionNote: 'Fixed',
        resolvedByUserId: 'qa-1',
        resolvedAt: new Date(),
      });

      const [values, options] = inspectionModel.update.mock.calls[0] as [
        Record<string, unknown>,
        { where: Record<string, unknown>; returning: boolean },
      ];
      expect(values.status).toBe(InspectionStatus.Resolved);
      expect(options.where.status).toBe(InspectionStatus.Open);
      expect(options.where.id).toBe('insp-1');
      expect(options.returning).toBe(true);
    });

    it('returns null when nothing matched, so the service can tell 404 from 409', async () => {
      inspectionModel.update.mockResolvedValue([0, []]);

      await expect(
        inspectionsRepository.resolveIfOpen({ kind: 'all' }, 'insp-1', {
          resolutionNote: 'Fixed',
          resolvedByUserId: 'qa-1',
          resolvedAt: new Date(),
        }),
      ).resolves.toBeNull();
    });
  });

  describe('summarize', () => {
    it('emits a GROUPING SETS clause and reuses the shared WHERE builder', async () => {
      await inspectionsRepository.summarize(
        { kind: 'own', userId: 'sup-1' },
        { status: InspectionStatus.Open },
      );

      const [options] = inspectionModel.findAll.mock.calls[0] as [
        {
          group: { val: string };
          where: Record<string, unknown>;
          raw: boolean;
        },
      ];
      // Sharing buildWhere with findMany is what guarantees the summary can never
      // disagree with the list above it.
      expect(options.where).toMatchObject({
        loggedByUserId: 'sup-1',
        status: InspectionStatus.Open,
      });
      expect(options.raw).toBe(true);
      expect(options.group.val).toContain('GROUPING SETS');
      expect(options.group.val).toContain('"status", "severity"');
      expect(options.group.val).toContain('"status", "plant_id"');
    });

    it('coerces COUNT to a number, since the pg driver returns bigint as a string', async () => {
      inspectionModel.findAll.mockResolvedValue([
        { status: 'open', severity: 'critical', plantId: null, count: '4' },
        { status: null, severity: null, plantId: null, count: '52' },
      ]);

      const rows = await inspectionsRepository.summarize({ kind: 'all' }, {});

      expect(rows[0]).toEqual({
        status: 'open',
        severity: Severity.Critical,
        plantId: null,
        count: 4,
      });
      expect(rows.every((row) => typeof row.count === 'number')).toBe(true);
      // The grand-total row legitimately has a null status.
      expect(rows[1].status).toBeNull();
    });
  });
});
