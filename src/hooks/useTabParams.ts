import { useState, useEffect, useCallback } from 'react';

/**
 * Syncs tab state with URL search params so tabs persist across
 * refresh and browser back/forward navigation.
 *
 * Usage:
 *   const [tab, setTab] = useTabParam('tab', 'documents', ['documents', 'health', 'signatures']);
 *   const [subTab, setSubTab] = useTabParam('subtab', 'received', ['received', 'sent']);
 */
export function useTabParam<T extends string>(
  paramName: string,
  defaultValue: T,
  validValues: readonly T[],
): [T, (value: T) => void] {
  const readParam = useCallback((): T => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get(paramName);
    if (raw && (validValues as readonly string[]).includes(raw)) {
      return raw as T;
    }
    return defaultValue;
  }, [paramName, defaultValue, validValues]);

  const [value, setValue] = useState<T>(readParam);

  // Sync URL → state on popstate (back/forward)
  useEffect(() => {
    const onPopState = () => {
      setValue(readParam());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [readParam]);

  // State setter that also updates URL
  const setValueAndUrl = useCallback(
    (newValue: T) => {
      setValue(newValue);

      const url = new URL(window.location.href);
      if (newValue === defaultValue) {
        url.searchParams.delete(paramName);
      } else {
        url.searchParams.set(paramName, newValue);
      }

      // Replace state so we don't create a history entry for every tab click.
      // Only the page-level navigation (handleNavigate) should pushState.
      window.history.replaceState(null, '', url.toString());
    },
    [paramName, defaultValue],
  );

  return [value, setValueAndUrl];
}
