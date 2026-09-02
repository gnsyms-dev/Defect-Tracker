import { useSyncExternalStore } from 'react';
import { useAppDI } from '@/app/di/useAppDI';
import type { ConnectivitySnapshot } from '../../application/domain/Connectivity';
import { Connectivity } from '../../application/domain/Connectivity';

/**
 * useSyncExternalStore, not useState + useEffect.
 *
 * It is the correct React 19 primitive here precisely because the publisher is a plain
 * service class rather than a hook -- and it is built in, which is part of why no state
 * library is needed for this app.
 */
export function useConnectivity(): ConnectivitySnapshot {
  const { connectivity } = useAppDI();
  return useSyncExternalStore(connectivity.subscribe, connectivity.getSnapshot);
}

export function useIsOffline(): boolean {
  return useConnectivity().status === Connectivity.Offline;
}
