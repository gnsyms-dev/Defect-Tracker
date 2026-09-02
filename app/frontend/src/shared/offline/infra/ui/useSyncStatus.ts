import { useSyncExternalStore } from 'react';
import { useAppDI } from '@/app/di/useAppDI';
import type { SyncStatus } from '../SyncEngine';

export function useSyncStatus(): SyncStatus {
  const { syncEngine } = useAppDI();
  return useSyncExternalStore(syncEngine.subscribe, syncEngine.getSnapshot);
}

export function useSyncNow(): () => void {
  const { syncEngine, connectivity } = useAppDI();
  return () => {
    void (async () => {
      // Probe first so a manual tap gives honest feedback rather than silently
      // failing when there is genuinely no connection.
      await connectivity.checkNow();
      await syncEngine.requestFlush('manual');
    })();
  };
}
