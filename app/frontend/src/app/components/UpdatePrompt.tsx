import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/shared/ui/Button';

/**
 * A reload prompt for a new service-worker build.
 *
 * registerType is 'prompt', not 'autoUpdate', deliberately: skip-waiting would swap
 * the bundle out from under a half-filled inspection form. The user decides when.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });

  if (!needRefresh) {
    return null;
  }

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-20 z-40 flex items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3 shadow-lg"
    >
      <p className="text-sm font-medium text-text">A new version is available.</p>
      <div className="flex shrink-0 gap-2">
        <Button variant="ghost" onClick={() => setNeedRefresh(false)}>
          Later
        </Button>
        <Button onClick={() => void updateServiceWorker(true)}>Reload</Button>
      </div>
    </div>
  );
}
