import {
  Connectivity,
  type ConnectivitySnapshot,
} from '../application/domain/Connectivity';

const PROBE_INTERVAL_MS = 30_000;

export interface ConnectivityMonitorOptions {
  /** Resolves true only on positive proof the API is reachable. */
  readonly probe: () => Promise<boolean>;
}

/**
 * Tracks reachability of OUR API, not of "the internet".
 *
 * Exposes subscribe/getSnapshot so React can read it through useSyncExternalStore --
 * the right primitive here precisely because the publisher is a plain service rather
 * than a hook.
 */
export class ConnectivityMonitor {
  private snapshot: ConnectivitySnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly probe: () => Promise<boolean>;
  private timer: ReturnType<typeof setInterval> | null = null;
  private isProbing = false;
  private isStarted = false;

  constructor(options: ConnectivityMonitorOptions) {
    this.probe = options.probe;
    this.snapshot = {
      // navigator.onLine === false is trustworthy; true only means "maybe".
      status:
        typeof navigator !== 'undefined' && navigator.onLine === false
          ? Connectivity.Offline
          : Connectivity.Unknown,
      lastOnlineAt: null,
    };
  }

  start(): void {
    if (this.isStarted || typeof window === 'undefined') {
      return;
    }
    this.isStarted = true;

    window.addEventListener('online', this.handleOnlineEvent);
    window.addEventListener('offline', this.handleOfflineEvent);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    void this.runProbe();
  }

  stop(): void {
    if (!this.isStarted || typeof window === 'undefined') {
      return;
    }
    this.isStarted = false;
    window.removeEventListener('online', this.handleOnlineEvent);
    window.removeEventListener('offline', this.handleOfflineEvent);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.clearTimer();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ConnectivitySnapshot => this.snapshot;

  /**
   * Positive proof of reachability. ANY http response counts -- including a 500:
   * the server answered, so the network is fine.
   */
  reportReachable(): void {
    this.clearTimer();
    this.update({ status: Connectivity.Online, lastOnlineAt: Date.now() });
  }

  /** A fetch rejection or timeout: the request did not complete. */
  reportUnreachable(): void {
    this.update({ ...this.snapshot, status: Connectivity.Offline });
    this.ensureTimer();
  }

  async checkNow(): Promise<boolean> {
    return this.runProbe();
  }

  private handleOnlineEvent = (): void => {
    // The 'online' event is a HINT to re-probe, never a fact: on a phone it commonly
    // fires before the radio can actually carry a request.
    void this.runProbe();
  };

  private handleOfflineEvent = (): void => {
    this.reportUnreachable();
  };

  private handleVisibilityChange = (): void => {
    // "Phone taken out of a pocket" is the real reconnection event, and it is far
    // more reliable than the 'online' event.
    if (document.visibilityState === 'visible') {
      void this.runProbe();
    }
  };

  private async runProbe(): Promise<boolean> {
    if (this.isProbing) {
      return this.snapshot.status === Connectivity.Online;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.reportUnreachable();
      return false;
    }

    this.isProbing = true;
    try {
      const reachable = await this.probe();
      if (reachable) {
        this.reportReachable();
      } else {
        this.reportUnreachable();
      }
      return reachable;
    } finally {
      this.isProbing = false;
    }
  }

  /** Polls only while offline; a healthy app schedules no timer at all. */
  private ensureTimer(): void {
    if (this.timer !== null || typeof window === 'undefined') {
      return;
    }
    this.timer = setInterval(() => {
      void this.runProbe();
    }, PROBE_INTERVAL_MS);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private update(next: ConnectivitySnapshot): void {
    if (
      next.status === this.snapshot.status &&
      next.lastOnlineAt === this.snapshot.lastOnlineAt
    ) {
      return;
    }
    this.snapshot = next;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
