import { cn } from '@/shared/lib/cn';

export interface SegmentedOption<TValue extends string> {
  readonly value: TValue;
  readonly label: string;
  /** Token-driven classes for the selected state, e.g. severity colours. */
  readonly selectedClassName?: string;
}

export interface SegmentedFieldProps<TValue extends string> {
  readonly name: string;
  readonly legend: string;
  readonly options: readonly SegmentedOption<TValue>[];
  readonly value: TValue | null;
  readonly onChange: (value: TValue) => void;
  readonly error?: string;
  readonly isRequired?: boolean;
  readonly className?: string;
}

/**
 * A segmented control built from REAL radio inputs in a fieldset.
 *
 * Chosen over a <select> for severity and status because an iOS select costs
 * tap -> scroll -> Done (three interactions for a three-option field), because the
 * options should be readable at a glance while reviewing, and because chips can be
 * colour-coded where select options cannot.
 *
 * Using real radios rather than buttons is what makes a screen reader announce
 * "Critical, radio button, 1 of 3" and makes arrow-key navigation work for free.
 */
export function SegmentedField<TValue extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  error,
  isRequired = false,
  className,
}: SegmentedFieldProps<TValue>) {
  const errorId = `${name}-error`;

  return (
    <fieldset className={cn('flex flex-col gap-1.5 border-0 p-0', className)}>
      <legend className="mb-1.5 text-sm font-medium text-text">
        {legend}
        {isRequired ? (
          <span className="ml-1 text-critical" aria-hidden="true">
            *
          </span>
        ) : null}
      </legend>

      <div
        className="grid grid-cols-3 gap-2"
        role="radiogroup"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      >
        {options.map((option) => {
          const id = `${name}-${option.value}`;
          const isSelected = value === option.value;
          return (
            <div key={option.value} className="contents">
              <input
                type="radio"
                id={id}
                name={name}
                value={option.value}
                checked={isSelected}
                onChange={() => onChange(option.value)}
                className="peer sr-only"
              />
              <label
                htmlFor={id}
                className={cn(
                  // min-h-12 (48px), not 44px: this is a primary decision field.
                  'flex min-h-12 cursor-pointer items-center justify-center rounded-control',
                  'border-2 px-2 text-center text-sm font-medium',
                  'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent',
                  isSelected
                    ? (option.selectedClassName ??
                      'border-accent bg-accent text-accent-fg')
                    : 'border-border bg-surface text-text-muted',
                )}
              >
                {option.label}
              </label>
            </div>
          );
        })}
      </div>

      {error ? (
        <p id={errorId} role="alert" className="text-sm font-medium text-critical">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
