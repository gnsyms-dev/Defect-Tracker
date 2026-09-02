// Instantiated directly rather than via @nestjs/testing -- see the note in
// src/app.controller.spec.ts for why (Nest 12 is ESM-only).
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { UserRole } from '@shared/enums/user-role.enum';
import type { AuthenticatedUser } from '@shared/types/authenticated-user.interface';
import type { UserDirectoryPort } from '@modules/auth/type/user-directory.port';
import type { PlantDirectoryPort } from '@modules/plants/type/plant-directory.port';
import { InspectionEntity } from '../entities/inspection.entity';
import type { InspectionSummaryRow } from '../../type/inspection-summary-row.interface';
import type { InspectionsRepositoryPort } from '../../type/inspections-repository.port';
import {
  DefectType,
  InspectionSortField,
  InspectionStatus,
  Severity,
  SortDirection,
} from '../../type/inspection.enum';
import { InspectionsService } from './inspections.service';

const PLANT_A = 'a0000001-0000-4000-8000-00000000000a';
const PLANT_B = 'a0000001-0000-4000-8000-00000000000b';

const supervisor: AuthenticatedUser = {
  id: 'sup-1',
  email: 'supervisor@example.com',
  fullName: 'Rakesh Patel',
  role: UserRole.Supervisor,
  plantId: PLANT_A,
};
const qaManager: AuthenticatedUser = {
  id: 'qa-1',
  email: 'qa@example.com',
  fullName: 'Meera Shah',
  role: UserRole.QaManager,
  plantId: PLANT_A,
};

interface InspectionOverrides {
  readonly id?: string;
  readonly clientUuid?: string;
  readonly plantId?: string;
  readonly loggedByUserId?: string;
  readonly status?: InspectionStatus;
  readonly severity?: Severity;
  readonly resolutionNote?: string | null;
  readonly resolvedByUserId?: string | null;
  readonly resolvedAt?: Date | null;
}

// Built through the real constructor rather than Object.assign(Object.create(...)),
// which returns `any` and would defeat the type checking this helper exists to give.
function buildInspection(
  overrides: InspectionOverrides = {},
): InspectionEntity {
  return new InspectionEntity(
    overrides.id ?? 'insp-1',
    overrides.clientUuid ?? 'client-uuid-1',
    overrides.plantId ?? PLANT_A,
    overrides.loggedByUserId ?? 'sup-1',
    '2026-09-01',
    'LOOM-04',
    DefectType.WeaveDefect,
    overrides.severity ?? Severity.Major,
    overrides.status ?? InspectionStatus.Open,
    null,
    overrides.resolutionNote ?? null,
    overrides.resolvedByUserId ?? null,
    overrides.resolvedAt ?? null,
    new Date('2026-09-01T09:00:00Z'),
    new Date('2026-09-01T09:00:05Z'),
    new Date('2026-09-01T09:00:05Z'),
  );
}

const TODAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    clientUuid: 'client-uuid-1',
    inspectionDate: TODAY,
    machineLineId: '  LOOM-04  ',
    defectType: DefectType.WeaveDefect,
    severity: Severity.Major,
    remarks: null as string | null,
    loggedAt: new Date(),
    ...overrides,
  };
}

describe('InspectionsService', () => {
  let inspectionsService: InspectionsService;
  let repository: jest.Mocked<InspectionsRepositoryPort>;
  let userDirectory: jest.Mocked<UserDirectoryPort>;
  let plantDirectory: jest.Mocked<PlantDirectoryPort>;

  beforeEach(() => {
    repository = {
      createIfAbsent: jest
        .fn()
        .mockResolvedValue({ inspection: buildInspection(), wasCreated: true }),
      findMany: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      findById: jest.fn().mockResolvedValue(null),
      summarize: jest.fn().mockResolvedValue([]),
      resolveIfOpen: jest.fn().mockResolvedValue(null),
    };
    userDirectory = {
      findSummariesByIds: jest
        .fn()
        .mockResolvedValue([
          { id: 'sup-1', fullName: 'Rakesh Patel', role: UserRole.Supervisor },
        ]),
    };
    plantDirectory = {
      findSummariesByIds: jest
        .fn()
        .mockResolvedValue([
          { id: PLANT_A, code: 'GJ-SUR-01', name: 'Surat Weaving Unit 1' },
        ]),
    };

    inspectionsService = new InspectionsService(
      repository,
      userDirectory,
      plantDirectory,
    );
  });

  // -------------------------------------------------------------------------
  // Scoping -- the security-critical behaviour
  // -------------------------------------------------------------------------
  describe('role scoping', () => {
    it('forces a supervisor to their own rows', async () => {
      await inspectionsService.list(
        supervisor,
        {},
        {
          field: InspectionSortField.InspectionDate,
          direction: SortDirection.Desc,
        },
        { page: 1, limit: 20 },
      );

      const [scope] = repository.findMany.mock.calls[0];
      expect(scope).toEqual({ kind: 'own', userId: 'sup-1' });
    });

    it('gives a QA manager the unrestricted scope', async () => {
      await inspectionsService.list(
        qaManager,
        {},
        {
          field: InspectionSortField.InspectionDate,
          direction: SortDirection.Desc,
        },
        { page: 1, limit: 20 },
      );

      const [scope] = repository.findMany.mock.calls[0];
      expect(scope).toEqual({ kind: 'all' });
    });

    it('derives the scope from the user even when filters mention another plant', async () => {
      await inspectionsService.list(
        supervisor,
        { plantId: PLANT_B },
        {
          field: InspectionSortField.InspectionDate,
          direction: SortDirection.Desc,
        },
        { page: 1, limit: 20 },
      );

      const [scope, filters] = repository.findMany.mock.calls[0];
      // The scope still pins the supervisor to their own rows; the plant filter is
      // merely intersected with it, so it can only ever narrow the result.
      expect(scope).toEqual({ kind: 'own', userId: 'sup-1' });
      expect(filters.plantId).toBe(PLANT_B);
    });

    it('scopes the summary the same way as the list', async () => {
      await inspectionsService.summarize(supervisor, {});
      const [scope] = repository.summarize.mock.calls[0];
      expect(scope).toEqual({ kind: 'own', userId: 'sup-1' });
    });

    it('returns 404 (not 403) for an inspection outside the scope', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(
        inspectionsService.getById(supervisor, 'insp-x'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------
  describe('log', () => {
    it('takes plantId from the user, not the request', async () => {
      await inspectionsService.log(supervisor, validInput());
      const [data] = repository.createIfAbsent.mock.calls[0];
      expect(data.plantId).toBe(PLANT_A);
      expect(data.loggedByUserId).toBe('sup-1');
    });

    it("rejects a plantId that is not the caller's own plant", async () => {
      await expect(
        inspectionsService.log(supervisor, validInput({ plantId: PLANT_B })),
      ).rejects.toThrow(ForbiddenException);
      expect(repository.createIfAbsent).not.toHaveBeenCalled();
    });

    it("accepts a plantId that merely confirms the caller's own plant", async () => {
      await expect(
        inspectionsService.log(supervisor, validInput({ plantId: PLANT_A })),
      ).resolves.toMatchObject({ wasCreated: true });
    });

    it('trims the machine/line id', async () => {
      await inspectionsService.log(supervisor, validInput());
      const [data] = repository.createIfAbsent.mock.calls[0];
      expect(data.machineLineId).toBe('LOOM-04');
    });

    it('surfaces a replay as wasCreated: false', async () => {
      repository.createIfAbsent.mockResolvedValue({
        inspection: buildInspection(),
        wasCreated: false,
      });
      const result = await inspectionsService.log(supervisor, validInput());
      expect(result.wasCreated).toBe(false);
    });

    it('rejects a future inspection date with 422', async () => {
      const future = new Date(Date.now() + 3 * 86400000)
        .toISOString()
        .slice(0, 10);
      await expect(
        inspectionsService.log(
          supervisor,
          validInput({ inspectionDate: future }),
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('accepts today in plant-local time (IST), which UTC "today" could reject', async () => {
      await expect(
        inspectionsService.log(
          supervisor,
          validInput({ inspectionDate: TODAY }),
        ),
      ).resolves.toBeDefined();
    });

    it('allows backdating, because entering a paper backlog is legitimate', async () => {
      await expect(
        inspectionsService.log(
          supervisor,
          validInput({ inspectionDate: '2026-01-15' }),
        ),
      ).resolves.toBeDefined();
    });

    it('requires remarks when defectType is other', async () => {
      await expect(
        inspectionsService.log(
          supervisor,
          validInput({ defectType: DefectType.Other, remarks: null }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('treats whitespace-only remarks as missing for defectType other', async () => {
      await expect(
        inspectionsService.log(
          supervisor,
          validInput({ defectType: DefectType.Other, remarks: '   ' }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts defectType other with real remarks', async () => {
      await expect(
        inspectionsService.log(
          supervisor,
          validInput({ defectType: DefectType.Other, remarks: 'Oil stain' }),
        ),
      ).resolves.toBeDefined();
    });

    it('clamps a device clock running more than 5 minutes fast', async () => {
      const twoHoursAhead = new Date(Date.now() + 2 * 3600_000);
      await inspectionsService.log(
        supervisor,
        validInput({ loggedAt: twoHoursAhead }),
      );

      const [data] = repository.createIfAbsent.mock.calls[0];
      expect(data.loggedAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it('preserves a loggedAt within tolerable skew', async () => {
      const oneMinuteAgo = new Date(Date.now() - 60_000);
      await inspectionsService.log(
        supervisor,
        validInput({ loggedAt: oneMinuteAgo }),
      );

      const [data] = repository.createIfAbsent.mock.calls[0];
      expect(data.loggedAt).toEqual(oneMinuteAgo);
    });

    it('rejects a loggedAt older than 30 days as a broken clock', async () => {
      await expect(
        inspectionsService.log(
          supervisor,
          validInput({ loggedAt: new Date(Date.now() - 45 * 86400000) }),
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  // -------------------------------------------------------------------------
  // Resolve
  // -------------------------------------------------------------------------
  describe('resolve', () => {
    it('returns the updated inspection when the conditional update matched', async () => {
      repository.resolveIfOpen.mockResolvedValue(
        buildInspection({
          status: InspectionStatus.Resolved,
          resolutionNote: 'Re-tensioned the warp.',
          resolvedByUserId: 'qa-1',
          resolvedAt: new Date(),
        }),
      );

      const item = await inspectionsService.resolve(
        qaManager,
        'insp-1',
        '  Re-tensioned the warp.  ',
      );

      expect(item.inspection.status).toBe(InspectionStatus.Resolved);
      const [, , data] = repository.resolveIfOpen.mock.calls[0];
      expect(data.resolutionNote).toBe('Re-tensioned the warp.');
      expect(data.resolvedByUserId).toBe('qa-1');
    });

    it('throws 404 when nothing matched and the row is not visible', async () => {
      repository.resolveIfOpen.mockResolvedValue(null);
      repository.findById.mockResolvedValue(null);

      await expect(
        inspectionsService.resolve(qaManager, 'insp-x', 'A valid note'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws 409 when nothing matched because it was already resolved', async () => {
      repository.resolveIfOpen.mockResolvedValue(null);
      repository.findById.mockResolvedValue(
        buildInspection({ status: InspectionStatus.Resolved }),
      );

      await expect(
        inspectionsService.resolve(qaManager, 'insp-1', 'A valid note'),
      ).rejects.toThrow(ConflictException);
    });
  });

  // -------------------------------------------------------------------------
  // Summary pivoting
  // -------------------------------------------------------------------------
  describe('summarize', () => {
    it('zero-fills every severity even when the database returns no rows at all', async () => {
      repository.summarize.mockResolvedValue([]);

      const summary = await inspectionsService.summarize(qaManager, {});

      expect(summary.bySeverity.map((s) => s.severity)).toEqual([
        Severity.Critical,
        Severity.Major,
        Severity.Minor,
      ]);
      expect(
        summary.bySeverity.every((s) => s.open === 0 && s.resolved === 0),
      ).toBe(true);
      expect(summary.totals).toEqual({ open: 0, resolved: 0, total: 0 });
    });

    it('pivots the four grouping sets into totals, severity and plant breakdowns', async () => {
      const rows: InspectionSummaryRow[] = [
        // severity x status
        {
          status: InspectionStatus.Open,
          severity: Severity.Critical,
          plantId: null,
          count: 4,
        },
        {
          status: InspectionStatus.Resolved,
          severity: Severity.Critical,
          plantId: null,
          count: 12,
        },
        {
          status: InspectionStatus.Open,
          severity: Severity.Major,
          plantId: null,
          count: 14,
        },
        // plant x status
        {
          status: InspectionStatus.Open,
          severity: null,
          plantId: PLANT_A,
          count: 18,
        },
        {
          status: InspectionStatus.Resolved,
          severity: null,
          plantId: PLANT_A,
          count: 12,
        },
        // per-status totals
        {
          status: InspectionStatus.Open,
          severity: null,
          plantId: null,
          count: 18,
        },
        {
          status: InspectionStatus.Resolved,
          severity: null,
          plantId: null,
          count: 12,
        },
        // grand total
        { status: null, severity: null, plantId: null, count: 30 },
      ];
      repository.summarize.mockResolvedValue(rows);

      const summary = await inspectionsService.summarize(qaManager, {});

      expect(summary.totals).toEqual({ open: 18, resolved: 12, total: 30 });

      const critical = summary.bySeverity.find(
        (s) => s.severity === Severity.Critical,
      );
      expect(critical).toEqual({
        severity: Severity.Critical,
        open: 4,
        resolved: 12,
        total: 16,
      });

      // Minor had no rows at all and must still be present as zeros.
      const minor = summary.bySeverity.find(
        (s) => s.severity === Severity.Minor,
      );
      expect(minor).toEqual({
        severity: Severity.Minor,
        open: 0,
        resolved: 0,
        total: 0,
      });

      expect(summary.byPlant).toHaveLength(1);
      expect(summary.byPlant[0]).toMatchObject({
        plantId: PLANT_A,
        open: 18,
        resolved: 12,
        total: 30,
      });
      expect(summary.byPlant[0].plant?.code).toBe('GJ-SUR-01');
    });

    it('rejects an inverted date range before querying', async () => {
      await expect(
        inspectionsService.summarize(qaManager, {
          dateFrom: '2026-09-01',
          dateTo: '2026-07-01',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(repository.summarize).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Read-model assembly
  // -------------------------------------------------------------------------
  describe('read model', () => {
    it('batches directory lookups into one call per directory for a whole page', async () => {
      repository.findMany.mockResolvedValue({
        items: [
          buildInspection({ id: 'i1', loggedByUserId: 'sup-1' }),
          buildInspection({ id: 'i2', loggedByUserId: 'sup-1' }),
          buildInspection({
            id: 'i3',
            loggedByUserId: 'sup-2',
            resolvedByUserId: 'qa-1',
          }),
        ],
        total: 3,
      });

      await inspectionsService.list(
        qaManager,
        {},
        {
          field: InspectionSortField.InspectionDate,
          direction: SortDirection.Desc,
        },
        { page: 1, limit: 20 },
      );

      expect(userDirectory.findSummariesByIds).toHaveBeenCalledTimes(1);
      expect(plantDirectory.findSummariesByIds).toHaveBeenCalledTimes(1);
      // Distinct ids only -- three rows, three distinct users (two loggers + a resolver).
      const [userIds] = userDirectory.findSummariesByIds.mock.calls[0];
      expect([...userIds].sort()).toEqual(['qa-1', 'sup-1', 'sup-2']);
    });

    it('makes no directory calls for an empty page', async () => {
      repository.findMany.mockResolvedValue({ items: [], total: 0 });

      await inspectionsService.list(
        qaManager,
        {},
        {
          field: InspectionSortField.InspectionDate,
          direction: SortDirection.Desc,
        },
        { page: 1, limit: 20 },
      );

      expect(userDirectory.findSummariesByIds).not.toHaveBeenCalled();
    });

    it('tolerates a name that cannot be resolved rather than failing the row', async () => {
      repository.findMany.mockResolvedValue({
        items: [buildInspection({ loggedByUserId: 'deleted-user' })],
        total: 1,
      });
      userDirectory.findSummariesByIds.mockResolvedValue([]);

      const page = await inspectionsService.list(
        qaManager,
        {},
        {
          field: InspectionSortField.InspectionDate,
          direction: SortDirection.Desc,
        },
        { page: 1, limit: 20 },
      );

      expect(page.items[0].loggedBy).toBeNull();
    });
  });
});
