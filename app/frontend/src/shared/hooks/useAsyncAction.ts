import { useCallback, useRef, useState } from 'react';

export interface AsyncActionState {
  readonly isRunning: boolean;
  readonly error: unknown;
}

export interface AsyncActionResult<TArgs extends readonly unknown[], TResult>
  extends AsyncActionState {
  readonly run: (...args: TArgs) => Promise<TResult | undefined>;
  readonly reset: () => void;
}

/**
 * One-shot mutations: submit, resolve, retry.
 *
 * The action is captured in the callback's closure rather than a ref written during
 * render -- `run` is only ever invoked from an event handler, so a fresh identity per
 * render costs nothing and keeps the hook free of render-phase ref writes.
 */
export function useAsyncAction<TArgs extends readonly unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
): AsyncActionResult<TArgs, TResult> {
  const [state, setState] = useState<AsyncActionState>({
    isRunning: false,
    error: null,
  });

  // A ref, not the state flag: state updates are async, so a fast double-tap on a
  // 48px button could otherwise fire the action twice. Only ever touched inside the
  // callback, never during render.
  const isRunningRef = useRef(false);

  const run = useCallback(
    async (...args: TArgs): Promise<TResult | undefined> => {
      if (isRunningRef.current) {
        return undefined;
      }
      isRunningRef.current = true;
      setState({ isRunning: true, error: null });

      try {
        const result = await action(...args);
        setState({ isRunning: false, error: null });
        return result;
      } catch (error) {
        setState({ isRunning: false, error });
        return undefined;
      } finally {
        isRunningRef.current = false;
      }
    },
    [action],
  );

  const reset = useCallback(() => {
    setState({ isRunning: false, error: null });
  }, []);

  return { ...state, run, reset };
}
