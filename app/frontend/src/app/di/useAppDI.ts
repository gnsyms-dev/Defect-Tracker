import { useContext } from 'react';
import { AppDIContext } from './app-di-context';
import type { AppDependencies } from './createAppDependencies';

export function useAppDI(): AppDependencies {
  const value = useContext(AppDIContext);
  if (!value) {
    // Throwing lets every consumer treat the value as non-null without a `!`
    // assertion, which the project's TypeScript standards ban.
    throw new Error('useAppDI must be used inside <AppDIProvider>');
  }
  return value;
}

/**
 * Per-feature selectors.
 *
 * The frontend-project-structure convention puts a DI context inside every feature's
 * infra/di. With three features whose dependencies are all boot-time singletons, three
 * nested providers would be pure overhead -- so one graph is built at the root and these
 * hooks select from it. Features still depend on their own slice rather than reaching
 * into a global bag, which is the property the convention is actually protecting.
 */
export function useInspectionDeps() {
  const { inspectionRepository, logInspection, outbox } = useAppDI();
  return { inspectionRepository, logInspection, outbox };
}

export function usePlantDeps() {
  const { plantRepository } = useAppDI();
  return { plantRepository };
}

export function useSyncDeps() {
  const { syncEngine, connectivity, outbox } = useAppDI();
  return { syncEngine, connectivity, outbox };
}
