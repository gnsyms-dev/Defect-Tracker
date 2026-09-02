import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { EnvironmentVariables } from '@config/environment/env.types';
import type { PasswordHasherPort } from '../../type/password-hasher.port';

/**
 * bcryptjs, deliberately: it is pure JavaScript.
 *
 * This repo's dev container runs node:24-slim while the host here is Node 22, and
 * docker-compose.dev.yml bind-mounts node_modules between them. A native addon
 * built by a host `npm i` fails to load under the container's Node -- and it fails
 * on the login path, the worst possible place to discover it. `bcrypt` and `argon2`
 * are both native addons; `bcryptjs` sidesteps the whole class of problem, and at
 * ~100ms per login it is irrelevant for a handful of logins per shift.
 *
 * Behind a port so swapping to argon2 later is one provider line.
 */
@Injectable()
export class BcryptPasswordHasher implements PasswordHasherPort {
  private readonly saltRounds: number;

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    this.saltRounds = configService.get('BCRYPT_SALT_ROUNDS', { infer: true });
  }

  async hash(plainPassword: string): Promise<string> {
    return bcrypt.hash(plainPassword, this.saltRounds);
  }

  async verify(plainPassword: string, hash: string): Promise<boolean> {
    // bcrypt.compare is constant-time with respect to the hash contents, so it is
    // safe against timing attacks on the password itself.
    return bcrypt.compare(plainPassword, hash);
  }
}
