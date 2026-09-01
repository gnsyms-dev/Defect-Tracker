import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../domain/services/auth.service';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  let authController: AuthController;

  beforeEach(async () => {
    const authService: Pick<AuthService, 'register' | 'login'> = {
      register: jest.fn(),
      login: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    authController = module.get(AuthController);
  });

  it('should be defined', () => {
    expect(authController).toBeDefined();
  });
});
