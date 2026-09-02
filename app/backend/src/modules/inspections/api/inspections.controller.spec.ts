// Instantiated directly rather than via @nestjs/testing -- see the note in
// src/app.controller.spec.ts for why (Nest 12 is ESM-only).
import type { Response } from 'express';
import { UserRole } from '@shared/enums/user-role.enum';
import { ResponseCode } from '@shared/enums/response-code.enum';
import type { AuthenticatedUser } from '@shared/types/authenticated-user.interface';
import { InspectionEntity } from '../domain/entities/inspection.entity';
import { InspectionsService } from '../domain/services/inspections.service';
import type { InspectionListItem } from '../type/inspection-list-item.interface';
import {
  DefectType,
  InspectionSortField,
  InspectionStatus,
  Severity,
  SortDirection,
} from '../type/inspection.enum';
import { InspectionsController } from './inspections.controller';
import type { CreateInspectionDto } from './dto/inspections-request.dto';

const supervisor: AuthenticatedUser = {
  id: 'sup-1',
  email: 'supervisor@example.com',
  fullName: 'Rakesh Patel',
  role: UserRole.Supervisor,
  plantId: 'plant-1',
};

const item: InspectionListItem = {
  inspection: new InspectionEntity(
    'insp-1',
    'client-1',
    'plant-1',
    'sup-1',
    '2026-09-01',
    'LOOM-04',
    DefectType.WeaveDefect,
    Severity.Major,
    InspectionStatus.Open,
    null,
    null,
    null,
    null,
    new Date('2026-09-01T09:00:00Z'),
    new Date('2026-09-01T09:05:00Z'),
    new Date('2026-09-01T09:05:00Z'),
  ),
  loggedBy: {
    id: 'sup-1',
    fullName: 'Rakesh Patel',
    role: UserRole.Supervisor,
  },
  resolvedBy: null,
  plant: { id: 'plant-1', code: 'GJ-SUR-01', name: 'Surat Weaving Unit 1' },
};

function buildResponseStub(): { res: Response; statusCalls: number[] } {
  const statusCalls: number[] = [];
  const res = {
    status: (code: number) => {
      statusCalls.push(code);
      return res;
    },
  } as unknown as Response;
  return { res, statusCalls };
}

const createDto: CreateInspectionDto = {
  clientUuid: 'client-1',
  inspectionDate: '2026-09-01',
  loggedAt: '2026-09-01T14:32:10+05:30',
  machineLineId: 'LOOM-04',
  defectType: DefectType.WeaveDefect,
  severity: Severity.Major,
};

describe('InspectionsController', () => {
  let inspectionsController: InspectionsController;
  let inspectionsService: jest.Mocked<
    Pick<
      InspectionsService,
      'log' | 'list' | 'getById' | 'resolve' | 'summarize'
    >
  >;

  beforeEach(() => {
    inspectionsService = {
      log: jest.fn().mockResolvedValue({ item, wasCreated: true }),
      list: jest.fn().mockResolvedValue({ items: [item], total: 1 }),
      getById: jest.fn().mockResolvedValue(item),
      resolve: jest.fn().mockResolvedValue(item),
      summarize: jest.fn().mockResolvedValue({
        totals: { open: 1, resolved: 0, total: 1 },
        bySeverity: [],
        byPlant: [],
      }),
    };
    inspectionsController = new InspectionsController(
      inspectionsService as unknown as InspectionsService,
    );
  });

  it('reports success on the health-check endpoint', () => {
    expect(inspectionsController.healthCheck()).toEqual({
      status: true,
      code: ResponseCode.Ok,
      message: 'OK',
      data: { status: 'ok' },
    });
  });

  describe('create — the 201/200 idempotency contract', () => {
    it('returns 201 Created for a genuine insert', async () => {
      const { res, statusCalls } = buildResponseStub();

      const response = await inspectionsController.create(
        supervisor,
        createDto,
        res,
      );

      expect(statusCalls).toEqual([201]);
      expect(response.code).toBe(ResponseCode.Created);
      expect(response.data?.id).toBe('insp-1');
    });

    it('returns 200 Ok with the SAME body when the create was a replay', async () => {
      inspectionsService.log.mockResolvedValue({ item, wasCreated: false });
      const { res, statusCalls } = buildResponseStub();

      const response = await inspectionsController.create(
        supervisor,
        createDto,
        res,
      );

      expect(statusCalls).toEqual([200]);
      expect(response.code).toBe(ResponseCode.Ok);
      // Same body as the 201 case: that is what lets the outbox treat any 2xx as
      // "done" with one branch instead of special-casing a conflict.
      expect(response.data?.id).toBe('insp-1');
      expect(response.data?.clientUuid).toBe('client-1');
    });

    it('normalises blank remarks to null rather than storing an empty string', async () => {
      const { res } = buildResponseStub();

      await inspectionsController.create(
        supervisor,
        { ...createDto, remarks: '   ' },
        res,
      );

      const [, input] = inspectionsService.log.mock.calls[0];
      expect(input.remarks).toBeNull();
    });

    it('passes the authenticated user through, never a body-supplied identity', async () => {
      const { res } = buildResponseStub();
      await inspectionsController.create(supervisor, createDto, res);

      const [user] = inspectionsService.log.mock.calls[0];
      expect(user).toBe(supervisor);
    });
  });

  describe('read endpoints', () => {
    it('echoes clientUuid and computes syncLagSeconds on the response', async () => {
      const response = await inspectionsController.findOne(
        supervisor,
        'insp-1',
      );

      expect(response.data?.clientUuid).toBe('client-1');
      // loggedAt 09:00:00 -> createdAt 09:05:00 = 300 seconds of sync lag.
      expect(response.data?.syncLagSeconds).toBe(300);
    });

    it('wraps the list in a paginated envelope with a derived totalPages', async () => {
      const response = await inspectionsController.list(supervisor, {
        page: 1,
        limit: 20,
        sortBy: InspectionSortField.InspectionDate,
        sortDir: SortDirection.Desc,
      });

      expect(response.data).toMatchObject({
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      expect(response.data?.items).toHaveLength(1);
    });

    it('never exposes loggedByUserId or plantId as raw ids on the row', async () => {
      const response = await inspectionsController.findOne(
        supervisor,
        'insp-1',
      );

      // The row carries resolved display objects instead of bare foreign keys.
      expect(response.data).not.toHaveProperty('loggedByUserId');
      expect(response.data).not.toHaveProperty('plantId');
      expect(response.data?.loggedBy?.fullName).toBe('Rakesh Patel');
      expect(response.data?.plant?.code).toBe('GJ-SUR-01');
    });
  });

  it('forwards the trimmed resolution note and the resolver identity', async () => {
    await inspectionsController.resolve(supervisor, 'insp-1', {
      resolutionNote: 'Re-tensioned the warp.',
    });

    expect(inspectionsService.resolve).toHaveBeenCalledWith(
      supervisor,
      'insp-1',
      'Re-tensioned the warp.',
    );
  });
});
