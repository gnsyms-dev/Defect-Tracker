import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
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
  private readonly logger = new Logger(AuthService.name);

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
      // The response is identical for every failure reason, but the LOG is not:
      // distinguishing them server-side is what makes a credential-stuffing run
      // (many unknown emails) legible next to one user fat-fingering a password.
      this.logger.warn(`Login rejected reason=unknown-email email=${email}`);
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
      this.logger.warn(
        `Login rejected reason=${isPasswordValid ? 'inactive-account' : 'invalid-password'} userId=${user.id}`,
      );
      throw new UnauthorizedException(AuthErrorMessage.InvalidCredentials);
    }

    const issued = await this.tokenIssuer.issue(user.id, user.email);
    const plant = await this.findPlant(user.plantId);

    // Fire-and-forget would be tempting, but an unawaited rejection would surface
    // as an unhandled promise rejection; the write is a single indexed update.
    await this.userRepository.touchLastLogin(user.id, new Date());

    this.logger.log(
      `Login succeeded userId=${user.id} role=${user.role} plantId=${user.plantId}`,
    );

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

    if (!user) {
      // A signature-valid token whose subject no longer exists: worth a warning
      // rather than a debug line, because the token outlives the row.
      this.logger.warn(
        `Session rejected reason=unknown-subject userId=${userId}`,
      );
      return null;
    }

    if (!user.isActive) {
      // The kill switch doing its job -- logged so a deactivation that is still
      // being exercised by a live client is visible.
      this.logger.warn(
        `Session rejected reason=inactive-account userId=${userId}`,
      );
      return null;
    }

    this.logger.debug(`Session resolved userId=${userId} role=${user.role}`);
    return AuthService.toAuthenticatedUser(user);
  }

  /** Backs GET /auth/me, so the SPA can revalidate a restored session. */
  async getAuthenticatedUserView(
    userId: string,
  ): Promise<AuthenticatedUserView> {
    const user = await this.userRepository.findById(userId);
    if (!user || !user.isActive) {
      this.logger.warn(
        `Profile rejected reason=${user ? 'inactive-account' : 'unknown-subject'} userId=${userId}`,
      );
      throw new UnauthorizedException(AuthErrorMessage.AccountUnavailable);
    }
    return { user, plant: await this.findPlant(user.plantId) };
  }

  private async findPlant(plantId: string): Promise<PlantSummary | null> {
    const [plant] = await this.plantDirectory.findSummariesByIds([plantId]);
    if (!plant) {
      // A user row always carries a plant_id FK, so a miss here is a referential
      // surprise rather than an ordinary empty result.
      this.logger.warn(`Plant not found for user plantId=${plantId}`);
      return null;
    }
    return plant;
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
