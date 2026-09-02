/**
 * In its own module so FormField.tsx exports only a component -- React Fast Refresh
 * cannot preserve state for a component file that also exports plain functions.
 */
export function fieldAria(
  id: string,
  options: { readonly hasError: boolean; readonly hasHint: boolean },
): { id: string; 'aria-invalid'?: true; 'aria-describedby'?: string } {
  const describedBy = [
    options.hasHint ? `${id}-hint` : null,
    options.hasError ? `${id}-error` : null,
  ].filter((value): value is string => value !== null);

  return {
    id,
    ...(options.hasError ? { 'aria-invalid': true as const } : {}),
    ...(describedBy.length > 0 ? { 'aria-describedby': describedBy.join(' ') } : {}),
  };
}
