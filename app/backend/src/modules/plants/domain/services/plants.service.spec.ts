// Instantiated directly rather than via @nestjs/testing -- see the note in
// src/app.controller.spec.ts for why (Nest 12 is ESM-only).
import { NotFoundException } from '@nestjs/common';
import { PlantEntity } from '../entities/plant.entity';
import type { PlantsRepositoryPort } from '../../type/plants-repository.port';
import { PlantsService } from './plants.service';

const plant = new PlantEntity(
  'p1',
  'GJ-SUR-01',
  'Surat Weaving Unit 1',
  'Surat',
  'Gujarat',
  true,
);

describe('PlantsService', () => {
  let plantsService: PlantsService;
  let plantsRepository: jest.Mocked<PlantsRepositoryPort>;

  beforeEach(() => {
    plantsRepository = {
      findAllActive: jest.fn().mockResolvedValue([plant]),
      findById: jest.fn(),
    };
    plantsService = new PlantsService(plantsRepository);
  });

  it('should be defined', () => {
    expect(plantsService).toBeDefined();
  });

  it('delegates the active list to the repository', async () => {
    await expect(plantsService.listActive()).resolves.toEqual([plant]);
    expect(plantsRepository.findAllActive).toHaveBeenCalledTimes(1);
  });

  it('returns a plant by id', async () => {
    plantsRepository.findById.mockResolvedValue(plant);
    await expect(plantsService.getById('p1')).resolves.toBe(plant);
  });

  it('throws NotFound rather than returning null for an unknown id', async () => {
    plantsRepository.findById.mockResolvedValue(null);
    await expect(plantsService.getById('missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});
