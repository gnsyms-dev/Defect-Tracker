import { ApiProperty } from '@nestjs/swagger';

export class PlantResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'GJ-SUR-01' })
  code: string;

  @ApiProperty({ example: 'Surat Weaving Unit 1' })
  name: string;

  @ApiProperty({ example: 'Surat' })
  city: string;

  @ApiProperty({ example: 'Gujarat' })
  state: string;
}
