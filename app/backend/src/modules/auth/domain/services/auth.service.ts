import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { UserRole } from '@shared/enums/user-role.enum';
import type { AuthenticatedUser } from '@shared/types/authenticated-user.interface';
import { PLANT_DIRECTORY } from '@modules/plants/type/plant-directory.port';
import type {
  PlantDirectoryPort,
  PlantSummary,
} from '@modules/plants/type/plant-directory.port';
import { UserEntity } from '../entities/user.entity';
import { AuthErrorMessage } from '../../type/auth.error.message';
import { PASSWORD_HASHER } from '../../type/password-hasher.port';
import type { PasswordHasherPort } from '../../type/password-hasher.port';
import { TOKEN_ISSUER } from '../../type/token-issuer.port';
import type { TokenIssuerPort } from '../../type/token-issuer.port';
import { USER_REPOSITORY } from '../../type/user-repository.port';
import type { UserRepositoryPort } from '../../type/user-repository.port';
import type {
  AuthenticatedUserView,
  AuthResult,
} from '../../type/auth-result.interface';

@Injectable()
export class AuthService {
  // Lazily-built hash of a throwaway value, used to equalise response time on the
  // unknown-email path. Without it, "no such user" returns measurably faster than
  // "wrong password", which is a usable account-enumeration oracle even though both
  // return the same message.
  private dummyHash: Promise<string> | null = null;

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepositoryPort,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasherPort,
    @Inject(TOKEN_ISSUER)
    private readonly tokenIssuer: TokenIssuerPort,
    @Inject(PLANT_DIRECTORY)
    private readonly plantDirectory: PlantDirectoryPort,
  ) {}

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.userRepository.findByEmail(email);

    if (!user) {
      await this.burnTimeOnDummyHash(password);
      throw new UnauthorizedException(AuthErrorMessage.InvalidCredentials);
    }

    const isPasswordValid = await this.passwordHasher.verify(
      password,
      user.passwordHash,
    );

    // Deliberately the same exception for a wrong password and a deactivated
    // account: a distinct "account disabled" message would confirm the address
    // exists.
    if (!isPasswordValid || !user.isActive) {
      throw new UnauthorizedException(AuthErrorMessage.InvalidCredentials);
    }

    const issued = await this.tokenIssuer.issue(user.id, user.email);
    const plant = await this.findPlant(user.plantId);

    // Fire-and-forget would be tempting, but an unawaited rejection would surface
    // as an unhandled promise rejection; the write is a single indexed update.
    await this.userRepository.touchLastLogin(user.id, new Date());

    return {
      user,
      plant,
      accessToken: issued.accessToken,
      expiresInSeconds: issued.expiresInSeconds,
    };
  }

  /**
   * Resolves the request-scoped identity for JwtAuthGuard.
   *
   * This runs on every authenticated request, which is the point: it is what makes
   * `is_active = false` an immediate kill switch despite there being no refresh
   * token, and it means `role`/`plantId` are always the database's current values
   * rather than claims minted up to 12 hours ago.
   *
   * Returns null rather than throwing so the guard owns the HTTP semantics.
   */
  async resolveAuthenticatedUser(
    userId: string,
  ): Promise<AuthenticatedUser | null> {
    const user = await this.userRepository.findById(userId);
    if (!user || !user.isActive) {
      return null;
    }
    return AuthService.toAuthenticatedUser(user);
  }

  /** Backs GET /auth/me, so the SPA can revalidate a restored session. */
  async getAuthenticatedUserView(
    userId: string,
  ): Promise<AuthenticatedUserView> {
    const user = await this.userRepository.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException(AuthErrorMessage.AccountUnavailable);
    }
    return { user, plant: await this.findPlant(user.plantId) };
  }

  private async findPlant(plantId: string): Promise<PlantSummary | null> {
    const [plant] = await this.plantDirectory.findSummariesByIds([plantId]);
    return plant ?? null;
  }

  private async burnTimeOnDummyHash(password: string): Promise<void> {
    this.dummyHash ??= this.passwordHasher.hash(randomUUID());
    await this.passwordHasher.verify(password, await this.dummyHash);
  }

  private static toAuthenticatedUser(user: UserEntity): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role satisfies UserRole,
      plantId: user.plantId,
    };
  }
}
