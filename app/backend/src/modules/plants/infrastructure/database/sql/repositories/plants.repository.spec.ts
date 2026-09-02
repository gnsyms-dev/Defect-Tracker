// Instantiated directly rather than via @nestjs/testing -- see the note in
// src/app.controller.spec.ts for why (Nest 12 is ESM-only).
import { PlantModel } from '../models/plant.model';
import { PlantsRepository } from './plants.repository';

describe('PlantsRepository', () => {
  let plantsRepository: PlantsRepository;
  let plantModel: { findAll: jest.Mock; findByPk: jest.Mock };

  beforeEach(() => {
    plantModel = {
      findAll: jest.fn().mockResolvedValue([]),
      findByPk: jest.fn(),
    };
    plantsRepository = new PlantsRepository(
      plantModel as unknown as typeof PlantModel,
    );
  });

  it('should be defined', () => {
    expect(plantsRepository).toBeDefined();
  });

  it('short-circuits an empty id list without querying', async () => {
    // `IN ()` is invalid SQL, so the empty case has to be handled before it
    // reaches the database.
    await expect(plantsRepository.findSummariesByIds([])).resolves.toEqual([]);
    expect(plantModel.findAll).not.toHaveBeenCalled();
  });

  it('queries only the columns the directory port exposes', async () => {
    await plantsRepository.findSummariesByIds(['p1', 'p2']);

    const [options] = plantModel.findAll.mock.calls[0] as [
      { attributes: string[] },
    ];
    expect(options.attributes).toEqual(['id', 'code', 'name']);
  });

  it('returns null instead of throwing for an unknown id', async () => {
    plantModel.findByPk.mockResolvedValue(null);
    await expect(plantsRepository.findById('missing')).resolves.toBeNull();
  });
});
