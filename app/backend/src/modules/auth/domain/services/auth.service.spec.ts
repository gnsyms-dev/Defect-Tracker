// Instantiated directly rather than through @nestjs/testing: the Nest 12 packages
// are ESM-only and Jest's CommonJS module registry cannot require them. Constructor
// injection means the container buys nothing here anyway.
import { UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@shared/enums/user-role.enum';
import type { PlantDirectoryPort } from '@modules/plants/type/plant-directory.port';
import { UserEntity } from '../entities/user.entity';
import { AuthErrorMessage } from '../../type/auth.error.message';
import type { PasswordHasherPort } from '../../type/password-hasher.port';
import type { TokenIssuerPort } from '../../type/token-issuer.port';
import type { UserRepositoryPort } from '../../type/user-repository.port';
import { AuthService } from './auth.service';

const PLANT_ID = '11111111-1111-4111-8111-111111111111';

interface UserOverrides {
  readonly id?: string;
  readonly email?: string;
  readonly passwordHash?: string;
  readonly fullName?: string;
  readonly role?: UserRole;
  readonly plantId?: string;
  readonly isActive?: boolean;
  readonly lastLoginAt?: Date | null;
}

// Built through the real constructor rather than Object.assign(Object.create(...)):
// the latter returns `any`, which quietly discards the type checking this helper
// exists to provide.
function buildUser(overrides: UserOverrides = {}): UserEntity {
  const timestamp = new Date('2026-01-01T00:00:00Z');
  return new UserEntity(
    overrides.id ?? '22222222-2222-4222-8222-222222222222',
    overrides.email ?? 'supervisor@example.com',
    overrides.passwordHash ?? '$2b$10$hash',
    overrides.fullName ?? 'Rakesh Patel',
    overrides.role ?? UserRole.Supervisor,
    overrides.plantId ?? PLANT_ID,
    overrides.isActive ?? true,
    overrides.lastLoginAt ?? null,
    timestamp,
    timestamp,
  );
}

describe('AuthService', () => {
  let authService: AuthService;
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let passwordHasher: jest.Mocked<PasswordHasherPort>;
  let tokenIssuer: jest.Mocked<TokenIssuerPort>;
  let plantDirectory: jest.Mocked<PlantDirectoryPort>;

  beforeEach(() => {
    userRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      touchLastLogin: jest.fn().mockResolvedValue(undefined),
    };
    passwordHasher = {
      hash: jest.fn().mockResolvedValue('$2b$10$dummy'),
      verify: jest.fn(),
    };
    tokenIssuer = {
      issue: jest.fn().mockResolvedValue({
        accessToken: 'token.abc',
        expiresInSeconds: 43200,
      }),
      verify: jest.fn(),
    };
    plantDirectory = {
      findSummariesByIds: jest
        .fn()
        .mockResolvedValue([
          { id: PLANT_ID, code: 'GJ-SUR-01', name: 'Surat Weaving Unit 1' },
        ]),
    };

    authService = new AuthService(
      userRepository,
      passwordHasher,
      tokenIssuer,
      plantDirectory,
    );
  });

  it('should be defined', () => {
    expect(authService).toBeDefined();
  });

  describe('login', () => {
    it('issues a token and records the login on valid credentials', async () => {
      const user = buildUser();
      userRepository.findByEmail.mockResolvedValue(user);
      passwordHasher.verify.mockResolvedValue(true);

      const result = await authService.login(
        'supervisor@example.com',
        'Passw0rd!',
      );

      expect(result.accessToken).toBe('token.abc');
      expect(result.expiresInSeconds).toBe(43200);
      expect(result.user).toBe(user);
      expect(result.plant).toEqual({
        id: PLANT_ID,
        code: 'GJ-SUR-01',
        name: 'Surat Weaving Unit 1',
      });
      expect(tokenIssuer.issue).toHaveBeenCalledWith(user.id, user.email);
      expect(userRepository.touchLastLogin).toHaveBeenCalledWith(
        user.id,
        expect.any(Date),
      );
    });

    it('rejects a wrong password without issuing a token', async () => {
      userRepository.findByEmail.mockResolvedValue(buildUser());
      passwordHasher.verify.mockResolvedValue(false);

      await expect(
        authService.login('supervisor@example.com', 'wrong'),
      ).rejects.toThrow(UnauthorizedException);
      expect(tokenIssuer.issue).not.toHaveBeenCalled();
      expect(userRepository.touchLastLogin).not.toHaveBeenCalled();
    });

    it('rejects a deactivated account even when the password is correct', async () => {
      userRepository.findByEmail.mockResolvedValue(
        buildUser({ isActive: false }),
      );
      passwordHasher.verify.mockResolvedValue(true);

      await expect(
        authService.login('supervisor@example.com', 'Passw0rd!'),
      ).rejects.toThrow(UnauthorizedException);
      expect(tokenIssuer.issue).not.toHaveBeenCalled();
    });

    it('returns an identical message for unknown email, wrong password and inactive account (no user enumeration)', async () => {
      const messageFromLogin = async (): Promise<string> => {
        try {
          await authService.login('someone@example.com', 'x');
          return 'NO ERROR THROWN';
        } catch (err) {
          return err instanceof Error ? err.message : String(err);
        }
      };

      userRepository.findByEmail.mockResolvedValue(null);
      const unknownEmail = await messageFromLogin();

      userRepository.findByEmail.mockResolvedValue(buildUser());
      passwordHasher.verify.mockResolvedValue(false);
      const wrongPassword = await messageFromLogin();

      userRepository.findByEmail.mockResolvedValue(
        buildUser({ isActive: false }),
      );
      passwordHasher.verify.mockResolvedValue(true);
      const inactiveAccount = await messageFromLogin();

      expect([unknownEmail, wrongPassword, inactiveAccount]).toEqual([
        AuthErrorMessage.InvalidCredentials,
        AuthErrorMessage.InvalidCredentials,
        AuthErrorMessage.InvalidCredentials,
      ]);
    });

    it('still performs a hash verification when the email is unknown, so response time does not leak account existence', async () => {
      userRepository.findByEmail.mockResolvedValue(null);

      await expect(
        authService.login('nobody@example.com', 'Passw0rd!'),
      ).rejects.toThrow(UnauthorizedException);

      expect(passwordHasher.hash).toHaveBeenCalledTimes(1);
      expect(passwordHasher.verify).toHaveBeenCalledWith(
        'Passw0rd!',
        '$2b$10$dummy',
      );
    });
  });

  describe('resolveAuthenticatedUser', () => {
    it('projects the user without the password hash', async () => {
      userRepository.findById.mockResolvedValue(buildUser());

      const user = await authService.resolveAuthenticatedUser('any-id');

      expect(user).toEqual({
        id: '22222222-2222-4222-8222-222222222222',
        email: 'supervisor@example.com',
        fullName: 'Rakesh Patel',
        role: UserRole.Supervisor,
        plantId: PLANT_ID,
      });
      expect(user).not.toHaveProperty('passwordHash');
    });

    it('returns null for a deactivated user, so a still-valid token stops working', async () => {
      userRepository.findById.mockResolvedValue(buildUser({ isActive: false }));
      await expect(
        authService.resolveAuthenticatedUser('any-id'),
      ).resolves.toBeNull();
    });

    it('returns null for an unknown user id', async () => {
      userRepository.findById.mockResolvedValue(null);
      await expect(
        authService.resolveAuthenticatedUser('gone'),
      ).resolves.toBeNull();
    });
  });

  describe('getAuthenticatedUserView', () => {
    it('throws for a deactivated user', async () => {
      userRepository.findById.mockResolvedValue(buildUser({ isActive: false }));
      await expect(authService.getAuthenticatedUserView('id')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('tolerates a missing plant rather than failing the request', async () => {
      userRepository.findById.mockResolvedValue(buildUser());
      plantDirectory.findSummariesByIds.mockResolvedValue([]);

      const view = await authService.getAuthenticatedUserView('id');
      expect(view.plant).toBeNull();
    });
  });
});
