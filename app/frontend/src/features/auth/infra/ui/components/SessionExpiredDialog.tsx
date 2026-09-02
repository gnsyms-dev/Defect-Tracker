import { useState } from 'react';
import { toUserMessage } from '@/shared/api/errors';
import { useAsyncAction } from '@/shared/hooks/useAsyncAction';
import { Button } from '@/shared/ui/Button';
import { FormField } from '@/shared/ui/FormField';
import { fieldAria } from '@/shared/ui/field-aria';
import { TextInput } from '@/shared/ui/inputs';
import { useIsOffline } from '@/shared/offline/infra/ui/useConnectivity';
import { useSyncStatus } from '@/shared/offline/infra/ui/useSyncStatus';
import { useAuth } from '../../di/useAuth';

/**
 * Shown OVER the current screen when the token expires, instead of redirecting.
 *
 * Two deliberate behaviours:
 *  - Offline, it does not even offer a sign-in attempt, because signing in requires the
 *    network. It says so plainly and confirms that queued work is safe -- which is the
 *    actual question the supervisor has at that moment.
 *  - It never clears the outbox. An expired session is not a reason to destroy
 *    unsynced inspections.
 */
export function SessionExpiredDialog() {
  const { session, reauthenticate, logout } = useAuth();
  const isOffline = useIsOffline();
  const { counts } = useSyncStatus();
  const [password, setPassword] = useState('');

  const email = session.status === 'expired' ? session.user.email : '';
  const queued = counts.pending + counts.syncing + counts.failed;

  const action = useAsyncAction(async () => {
    await reauthenticate({ email, password });
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div aria-hidden="true" className="absolute inset-0 bg-black/50" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-expired-title"
        className="relative w-full max-w-sm rounded-card border border-border bg-surface p-5"
      >
        <h2 id="session-expired-title" className="text-base font-semibold text-text">
          Session expired
        </h2>

        {queued > 0 ? (
          <p className="mt-2 rounded-control bg-pending-bg px-3 py-2 text-sm text-pending">
            {queued === 1
              ? '1 inspection is saved on this device and will sync after you sign in.'
              : `${queued} inspections are saved on this device and will sync after you sign in.`}
          </p>
        ) : null}

        {isOffline ? (
          <p className="mt-2 text-sm text-text-muted">
            You&apos;re offline, so signing in isn&apos;t possible yet. Anything you
            already saved is safe on this device.
          </p>
        ) : (
          <form
            noValidate
            className="mt-3 flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void action.run();
            }}
          >
            <p className="text-sm text-text-muted">
              Signed in as <span className="font-medium text-text">{email}</span>
            </p>

            {action.error ? (
              <p role="alert" className="text-sm font-medium text-critical">
                {toUserMessage(action.error)}
              </p>
            ) : null}

            <FormField id="reauth-password" label="Password" isRequired>
              <TextInput
                {...fieldAria('reauth-password', { hasError: false, hasHint: false })}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </FormField>

            <Button type="submit" size="lg" isFullWidth isLoading={action.isRunning}>
              Continue
            </Button>
          </form>
        )}

        <Button variant="ghost" isFullWidth className="mt-2" onClick={logout}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
