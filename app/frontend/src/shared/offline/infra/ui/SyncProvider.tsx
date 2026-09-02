import { useEffect, type PropsWithChildren } from 'react';
import { useAppDI } from '@/app/di/useAppDI';

/**
 * Starts the connectivity monitor and the sync engine, and tears them down on unmount.
 *
 * A component rather than a module side effect so the listeners' lifetime is tied to
 * the React tree -- which is what makes tests and hot reload behave.
 */
export function SyncProvider({ children }: PropsWithChildren) {
  const { connectivity, syncEngine } = useAppDI();

  useEffect(() => {
    connectivity.start();
    syncEngine.start();
    return () => {
      syncEngine.stop();
      connectivity.stop();
    };
  }, [connectivity, syncEngine]);

  return children;
}
