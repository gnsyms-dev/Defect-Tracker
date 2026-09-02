import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

/**
 * Kept separate from vite.config.ts on purpose: `test` is not part of Vite's own
 * UserConfig, so declaring it there fails typechecking. Merging means the test run
 * still gets the React plugin (needed for JSX) and the '@' alias.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      // Explicit imports from 'vitest' rather than injected globals -- keeps the
      // type surface honest and matches the repo's import conventions.
      globals: false,
      setupFiles: ['./vitest.setup.ts'],
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
  }),
);
