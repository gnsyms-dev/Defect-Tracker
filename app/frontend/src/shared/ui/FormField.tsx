import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export interface FormFieldProps {
  readonly id: string;
  readonly label: string;
  readonly error?: string;
  readonly hint?: string;
  readonly isRequired?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * Owns the label / error / aria-describedby wiring for every input.
 *
 * Centralising it here is what makes accessibility a property of the design system
 * rather than something each form has to remember -- which matters because
 * eslint-plugin-jsx-a11y cannot be installed on this repo's eslint 10.
 *
 * The label is always ABOVE the input and is never replaced by a placeholder:
 * a placeholder disappears on focus and is not announced reliably.
 */
export function FormField({
  id,
  label,
  error,
  hint,
  isRequired = false,
  children,
  className,
}: FormFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
        {isRequired ? (
          <span className="ml-1 text-critical" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      {hint ? (
        <p id={hintId} className="text-xs text-text-muted">
          {hint}
        </p>
      ) : null}

      {children}

      {error ? (
        <p id={errorId} role="alert" className="text-sm font-medium text-critical">
          {error}
        </p>
      ) : null}
    </div>
  );
}
