import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

// RegisterDto is deliberately absent. Accounts are seeded, and an open register
// endpoint on which a self-assigned role would grant defect-resolution authority is
// a live privilege-escalation path. When user management is genuinely needed it
// belongs in a designed invite flow, not here.
export class LoginDto {
  @ApiProperty({ example: 'supervisor@example.com' })
  // Typed param so `value` is `unknown` rather than class-transformer's `any`;
  // returning `any` from a transform would silently defeat the DTO's own typing.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Passw0rd!' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
