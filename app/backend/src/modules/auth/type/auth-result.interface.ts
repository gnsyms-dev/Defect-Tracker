import { UserEntity } from '../domain/entities/user.entity';
import type { PlantSummary } from '@modules/plants/type/plant-directory.port';

export interface AuthResult {
  readonly user: UserEntity;
  readonly plant: PlantSummary | null;
  readonly accessToken: string;
  readonly expiresInSeconds: number;
}

export interface AuthenticatedUserView {
  readonly user: UserEntity;
  readonly plant: PlantSummary | null;
}
