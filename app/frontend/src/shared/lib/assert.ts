/**
 * Narrows away null/undefined with a real runtime check.
 *
 * Exists so the codebase never needs a `!` non-null assertion, which the project's
 * TypeScript standards ban: `!` silently lies at runtime, this throws with context.
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message: string,
): T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
  return value;
}
