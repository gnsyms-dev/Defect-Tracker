import { useCallback, useEffect, useState } from 'react';

/**
 * Persists an in-progress text value to sessionStorage.
 *
 * Used for the mandatory resolution note so an accidental refresh, or the phone
 * backgrounding the tab, does not discard what the QA manager had typed. sessionStorage
 * rather than localStorage: a draft is genuinely per-tab and should not outlive it.
 */
export function useSessionDraft(
  key: string,
  initialValue = '',
): readonly [string, (value: string) => void, () => void] {
  const [value, setValue] = useState<string>(() => {
    try {
      return sessionStorage.getItem(key) ?? initialValue;
    } catch {
      // Private mode and some embedded browsers throw on access rather than
      // returning null. A lost draft is acceptable; a crashed screen is not.
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      if (value) {
        sessionStorage.setItem(key, value);
      } else {
        sessionStorage.removeItem(key);
      }
    } catch {
      // Ignored deliberately -- see above.
    }
  }, [key, value]);

  const clear = useCallback(() => {
    setValue('');
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Ignored deliberately.
    }
  }, [key]);

  return [value, setValue, clear] as const;
}
