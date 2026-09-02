import { useMemo, type PropsWithChildren } from 'react';
import { AppDIContext } from './app-di-context';
import { createAppDependencies } from './createAppDependencies';

export function AppDIProvider({ children }: PropsWithChildren) {
  // Built once for the app's lifetime. useMemo with an empty dependency list rather
  // than a module-level singleton, so a test can mount a fresh graph per render tree.
  const dependencies = useMemo(() => createAppDependencies(), []);

  return (
    <AppDIContext.Provider value={dependencies}>{children}</AppDIContext.Provider>
  );
}
