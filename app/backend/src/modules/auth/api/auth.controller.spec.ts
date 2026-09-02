import { UserRole } from '@shared/enums/user-role.enum';
import type { AuthenticatedUser } from '@shared/types/authenticated-user.interface';
import { ResponseCode } from '@shared/enums/response-code.enum';
import { UserEntity } from '../domain/entities/user.entity';
import { AuthService } from '../domain/services/auth.service';
import { AuthController } from './auth.controller';

const PLANT = { id: 'p1', code: 'GJ-SUR-01', name: 'Surat Weaving Unit 1' };

const user = new UserEntity(
  'u1',
  'supervisor@example.com',
  '$2b$10$hash',
  'Rakesh Patel',
  UserRole.Supervisor,
  'p1',
  true,
  null,
  new Date('2026-01-01T00:00:00Z'),
  new Date('2026-01-01T00:00:00Z'),
);

describe('AuthController', () => {
  let authController: AuthController;
  let authService: jest.Mocked<
    Pick<AuthService, 'login' | 'getAuthenticatedUserView'>
  >;

  beforeEach(() => {
    authService = {
      login: jest.fn().mockResolvedValue({
        user,
        plant: PLANT,
        accessToken: 'token.abc',
        expiresInSeconds: 43200,
      }),
      getAuthenticatedUserView: jest
        .fn()
        .mockResolvedValue({ user, plant: PLANT }),
    };

    // The controller only needs the service's shape, so a structural cast of the
    // mock is honest here -- it is not forcing an unrelated type into place.
    authController = new AuthController(authService as unknown as AuthService);
  });

  it('should be defined', () => {
    expect(authController).toBeDefined();
  });

  it('reports success on the health-check endpoint', () => {
    expect(authController.healthCheck()).toEqual({
      status: true,
      code: ResponseCode.Ok,
      message: 'OK',
      data: { status: 'ok' },
    });
  });

  it('wraps the login result in the response envelope', async () => {
    const response = await authController.login({
      email: 'supervisor@example.com',
      password: 'Passw0rd!',
    });

    expect(response.status).toBe(true);
    expect(response.code).toBe(ResponseCode.Ok);
    expect(response.data?.accessToken).toBe('token.abc');
    expect(response.data?.user.role).toBe(UserRole.Supervisor);
  });

  it('never exposes the password hash through login', async () => {
    const response = await authController.login({
      email: 'supervisor@example.com',
      password: 'Passw0rd!',
    });

    expect(JSON.stringify(response)).not.toContain('$2b$10$hash');
    expect(response.data?.user).not.toHaveProperty('passwordHash');
  });

  it('resolves /me from the authenticated id, not from client input', async () => {
    const currentUser: AuthenticatedUser = {
      id: 'u1',
      email: 'supervisor@example.com',
      fullName: 'Rakesh Patel',
      role: UserRole.Supervisor,
      plantId: 'p1',
    };

    const response = await authController.me(currentUser);

    expect(authService.getAuthenticatedUserView).toHaveBeenCalledWith('u1');
    expect(response.data?.plant).toEqual(PLANT);
  });
});
