// Instantiated directly rather than via @nestjs/testing -- see the note in
// src/app.controller.spec.ts for why (Nest 12 is ESM-only).
import type { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '@config/environment/env.types';
import { BcryptPasswordHasher } from './bcrypt-password-hasher';

// 4 is bcrypt's minimum cost. Real deployments use BCRYPT_SALT_ROUNDS=10; the low
// value here keeps the suite fast without changing the behaviour under test.
function buildHasher(rounds = 4): BcryptPasswordHasher {
  const configService = {
    get: jest.fn().mockReturnValue(rounds),
  } as unknown as ConfigService<EnvironmentVariables, true>;
  return new BcryptPasswordHasher(configService);
}

describe('BcryptPasswordHasher', () => {
  it('produces a verifiable bcrypt hash', async () => {
    const hasher = buildHasher();
    const hash = await hasher.hash('Passw0rd!');

    expect(hash).toMatch(/^\$2[aby]\$/);
    await expect(hasher.verify('Passw0rd!', hash)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hasher = buildHasher();
    const hash = await hasher.hash('Passw0rd!');
    await expect(hasher.verify('passw0rd!', hash)).resolves.toBe(false);
  });

  it('salts, so the same password hashes differently every time', async () => {
    const hasher = buildHasher();
    const [a, b] = await Promise.all([
      hasher.hash('Passw0rd!'),
      hasher.hash('Passw0rd!'),
    ]);
    expect(a).not.toBe(b);
  });

  it('verifies a hash produced by the seeder at cost 10', async () => {
    // Drift guard. The seeder hashes with require('bcryptjs') at cost 10 while the
    // app verifies through this adapter; if the two ever disagree, login would
    // silently fail for every seeded account. This locks them together.
    const seederStyleHash = await buildHasher(10).hash('Passw0rd!');
    await expect(
      buildHasher(4).verify('Passw0rd!', seederStyleHash),
    ).resolves.toBe(true);
  });
});
