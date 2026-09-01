import { getModelToken } from '@nestjs/sequelize';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthUserModel } from '../models/auth-user.model';
import { AuthRepository } from './auth.repository';

describe('AuthRepository', () => {
  let authRepository: AuthRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthRepository,
        {
          provide: getModelToken(AuthUserModel),
          useValue: { findOne: jest.fn(), create: jest.fn() },
        },
      ],
    }).compile();

    authRepository = module.get(AuthRepository);
  });

  it('should be defined', () => {
    expect(authRepository).toBeDefined();
  });
});
