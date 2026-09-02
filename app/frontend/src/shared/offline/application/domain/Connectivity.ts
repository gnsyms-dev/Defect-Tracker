/**
 * Three states, not a boolean -- because `navigator.onLine` cannot express the case
 * that actually matters.
 *
 *  - `navigator.onLine === false` is TRUSTWORTHY: no interface means no network.
 *  - `navigator.onLine === true` is NOT: it is also true on a captive portal, and on
 *    plant wifi whose backhaul is down. So it only ever means `unknown` until a real
 *    request proves otherwise.
 *
 * Evidence comes from request outcomes: any HTTP response -- INCLUDING a 500 --
 * proves we are online, while a fetch rejection or timeout proves we are not.
 */
export const Connectivity = {
  Online: 'online',
  Offline: 'offline',
  Unknown: 'unknown',
} as const;
export type Connectivity = (typeof Connectivity)[keyof typeof Connectivity];

export interface ConnectivitySnapshot {
  readonly status: Connectivity;
  /** When we last had positive proof of reachability. */
  readonly lastOnlineAt: number | null;
}

/** True when we should present the UI as offline (offline, or never yet proven). */
export function shouldShowOffline(snapshot: ConnectivitySnapshot): boolean {
  return snapshot.status === Connectivity.Offline;
}
