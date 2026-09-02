// Instantiated directly rather than via @nestjs/testing -- see the note in
// src/app.controller.spec.ts for why (Nest 12 is ESM-only).
import { ResponseCode } from '@shared/enums/response-code.enum';
import { PlantEntity } from '../domain/entities/plant.entity';
import { PlantsService } from '../domain/services/plants.service';
import { PlantsController } from './plants.controller';

const plant = new PlantEntity(
  'p1',
  'GJ-SUR-01',
  'Surat Weaving Unit 1',
  'Surat',
  'Gujarat',
  true,
);

describe('PlantsController', () => {
  let plantsController: PlantsController;

  beforeEach(() => {
    const plantsService = {
      listActive: jest.fn().mockResolvedValue([plant]),
      getById: jest.fn(),
    } as unknown as PlantsService;
    plantsController = new PlantsController(plantsService);
  });

  it('should be defined', () => {
    expect(plantsController).toBeDefined();
  });

  it('reports success on the health-check endpoint', () => {
    expect(plantsController.healthCheck()).toEqual({
      status: true,
      code: ResponseCode.Ok,
      message: 'OK',
      data: { status: 'ok' },
    });
  });

  it('maps entities to response DTOs without leaking isActive', async () => {
    const response = await plantsController.list();

    expect(response.code).toBe(ResponseCode.Ok);
    expect(response.data).toEqual([
      {
        id: 'p1',
        code: 'GJ-SUR-01',
        name: 'Surat Weaving Unit 1',
        city: 'Surat',
        state: 'Gujarat',
      },
    ]);
    expect(response.data?.[0]).not.toHaveProperty('isActive');
  });
});
