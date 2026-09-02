import { z } from 'zod';

export const plantDtoSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  city: z.string(),
  state: z.string(),
});

export const plantListDtoSchema = z.array(plantDtoSchema);

export type PlantDto = z.infer<typeof plantDtoSchema>;
