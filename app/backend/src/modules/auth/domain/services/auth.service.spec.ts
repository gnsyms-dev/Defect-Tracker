import { Test, TestingModule } from '@nestjs/testing';
import { AUTH_REPOSITORY } from '../../type/auth-repository.port';
import type { AuthRepositoryPort } from '../../type/auth-repository.port';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(async () => {
    const authRepository: AuthRepositoryPort = {
      findByEmail: jest.fn(),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AUTH_REPOSITORY, useValue: authRepository },
      ],
    }).compile();

    authService = module.get(AuthService);
  });

  it('should be defined', () => {
    expect(authService).toBeDefined();
  });
});
