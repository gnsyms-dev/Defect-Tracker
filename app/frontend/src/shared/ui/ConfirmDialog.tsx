import { useEffect, useRef } from 'react';
import { Button } from './Button';

export interface ConfirmDialogProps {
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly secondaryLabel?: string;
  readonly isConfirmLoading?: boolean;
  readonly onConfirm: () => void;
  readonly onSecondary?: () => void;
  readonly onCancel: () => void;
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  secondaryLabel,
  isConfirmLoading = false,
  onConfirm,
  onSecondary,
  onCancel,
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden="true" className="absolute inset-0 bg-black/50" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        tabIndex={-1}
        className="relative w-full max-w-sm rounded-card border border-border bg-surface p-5 outline-none"
      >
        <h2 id="confirm-title" className="text-base font-semibold text-text">
          {title}
        </h2>
        <p className="mt-2 text-sm text-text-muted">{description}</p>

        <div className="mt-5 flex flex-col gap-2">
          <Button
            size="lg"
            isFullWidth
            isLoading={isConfirmLoading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
          {secondaryLabel && onSecondary ? (
            <Button size="lg" variant="secondary" isFullWidth onClick={onSecondary}>
              {secondaryLabel}
            </Button>
          ) : null}
          <Button variant="ghost" isFullWidth onClick={onCancel}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
