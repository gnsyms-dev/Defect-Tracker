import { useCallback, useSyncExternalStore } from 'react';

/**
 * Reads a media query through useSyncExternalStore.
 *
 * Used to choose between the card list and the table rather than CSS-hiding both:
 * rendering both would double the DOM and make a screen reader announce every row
 * twice.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) {
        return () => undefined;
      }
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return false;
    }
    return window.matchMedia(query).matches;
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** The one breakpoint that changes layout structure rather than just spacing. */
export const MD_BREAKPOINT_QUERY = '(min-width: 768px)';
