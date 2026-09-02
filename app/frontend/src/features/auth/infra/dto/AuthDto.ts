import { z } from 'zod';
import { UserRole } from '../../application/domain/UserRole';

/**
 * DTO schemas mirror the API's shape EXACTLY. Mapping to the domain happens in
 * AuthMapper, so no API shape leaks past this folder.
 */
export const authPlantDtoSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
});

export const authenticatedUserDtoSchema = z.object({
  id: z.string(),
  email: z.string(),
  fullName: z.string(),
  role: z.enum([UserRole.Supervisor, UserRole.QaManager]),
  plantId: z.string(),
  plant: authPlantDtoSchema.nullable().optional(),
});

export const loginResponseDtoSchema = z.object({
  accessToken: z.string(),
  expiresInSeconds: z.number(),
  user: authenticatedUserDtoSchema,
});

export type AuthPlantDto = z.infer<typeof authPlantDtoSchema>;
export type AuthenticatedUserDto = z.infer<typeof authenticatedUserDtoSchema>;
export type LoginResponseDto = z.infer<typeof loginResponseDtoSchema>;

export interface LoginRequestDto {
  readonly email: string;
  readonly password: string;
}
