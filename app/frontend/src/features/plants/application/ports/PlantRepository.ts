import type { LoadOptions } from '@/shared/api/DataSnapshot';
import type { Plant } from '../domain/entities/Plant';

export interface PlantRepository {
  listActive(options?: LoadOptions<readonly Plant[]>): Promise<readonly Plant[]>;
}
