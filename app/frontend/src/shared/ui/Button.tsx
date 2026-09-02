import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly isFullWidth?: boolean;
  readonly isLoading?: boolean;
  readonly children: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-fg active:brightness-125 disabled:opacity-50',
  secondary:
    'bg-surface text-text border border-border active:bg-surface-muted disabled:opacity-50',
  ghost: 'bg-transparent text-text-muted active:bg-surface-muted',
  danger: 'bg-danger text-white active:brightness-110 disabled:opacity-50',
};

// md is the 44px minimum; lg is 48px, used for primary and destructive actions
// because a gloved hand on a shop floor needs the extra margin.
const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: 'min-h-tap px-4 text-base',
  lg: 'min-h-12 px-5 text-base font-medium',
};

export function Button({
  variant = 'primary',
  size = 'md',
  isFullWidth = false,
  isLoading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled === true || isLoading}
      aria-busy={isLoading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-control font-medium',
        'transition-[filter,background-color] outline-offset-2',
        'focus-visible:outline-2 focus-visible:outline-accent',
        'disabled:cursor-not-allowed',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        isFullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {isLoading ? (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
    </button>
  );
}
