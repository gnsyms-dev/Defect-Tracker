export type QueryValue = string | number | boolean | undefined | null;
export type QueryParams = Readonly<Record<string, QueryValue | readonly QueryValue[]>>;

/**
 * Serialises params with keys sorted and empties dropped.
 *
 * Used for BOTH the request URL and the IndexedDB cache key, deliberately: if the
 * two were built differently, `?a=1&b=2` and `?b=2&a=1` would produce two cache
 * entries for one logical query.
 */
export function canonicalQuery(params: QueryParams | undefined): string {
  if (!params) {
    return '';
  }

  const search = new URLSearchParams();
  for (const key of Object.keys(params).sort()) {
    const value = params[key];
    if (value === undefined || value === null || value === '') {
      continue;
    }
    if (Array.isArray(value)) {
      const kept = value.filter(
        (entry): entry is string | number | boolean =>
          entry !== undefined && entry !== null && entry !== '',
      );
      if (kept.length > 0) {
        // Comma-joined rather than repeated keys: the backend's DTO transform
        // accepts both, and one canonical form keeps cache keys stable.
        search.set(key, kept.map(String).join(','));
      }
      continue;
    }
    search.set(key, String(value));
  }

  return search.toString();
}
