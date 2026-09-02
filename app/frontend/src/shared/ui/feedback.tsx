import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export function Spinner({ className }: { readonly className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-block size-5 animate-spin rounded-full border-2 border-text-muted border-t-transparent',
        className,
      )}
    />
  );
}

export interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="text-base font-medium text-text">{title}</p>
      {description ? (
        <p className="max-w-xs text-sm text-text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export interface ErrorStateProps {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
}

export function ErrorState({ title, description, action }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="mx-4 my-6 flex flex-col items-start gap-2 rounded-card border border-critical/40 bg-critical-bg p-4"
    >
      <p className="text-base font-medium text-critical">{title}</p>
      {description ? (
        <p className="text-sm text-text">{description}</p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export interface BadgeProps {
  readonly children: ReactNode;
  readonly className?: string;
  /** Rendered alongside the colour, never instead of it. */
  readonly title?: string;
}

/**
 * Colour is never the only signal here -- the label text always carries the meaning
 * too. Colour-blindness plus a dusty screen under plant lighting is a real
 * combination.
 */
export function Badge({ children, className, title }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
        className,
      )}
    >
      {children}
    </span>
  );
}

export interface CardProps {
  readonly children: ReactNode;
  readonly className?: string;
  /** Optional coloured left edge, used to encode severity on list rows. */
  readonly accentClassName?: string;
}

export function Card({ children, className, accentClassName }: CardProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-card border border-border bg-surface',
        className,
      )}
    >
      {accentClassName ? (
        <span
          aria-hidden="true"
          className={cn('absolute inset-y-0 left-0 w-1', accentClassName)}
        />
      ) : null}
      {children}
    </div>
  );
}
