import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Opt out of the globally registered JwtAuthGuard.
//
// This is the only auth-adjacent decorator that belongs in shared/: it is a bare
// SetMetadata with zero imports from src/modules/, and src/app.controller.ts needs
// it -- having the root controller import a feature module's decorator would be
// strictly worse.
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
