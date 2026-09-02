import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/shared/lib/cn';

// text-base is 16px and is NOT cosmetic: any input rendering below 16px makes iOS
// Safari zoom the whole page on focus, which reads as a broken layout mid-form.
const CONTROL_CLASSES = cn(
  'w-full min-h-tap rounded-control border border-border bg-surface',
  'px-3 py-2 text-base text-text placeholder:text-text-muted',
  'outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent',
  'aria-[invalid]:border-critical',
  'disabled:opacity-60',
);

export type TextInputProps = InputHTMLAttributes<HTMLInputElement>;

export function TextInput({ className, ...rest }: TextInputProps) {
  return <input className={cn(CONTROL_CLASSES, className)} {...rest} />;
}

export type DateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/**
 * A NATIVE date input, deliberately not a custom picker.
 *
 * It opens the OS widget the supervisor already knows, gets DD/MM ordering and
 * localisation for free, is keyboard and screen-reader accessible with no work,
 * costs zero bundle, and its value is already `yyyy-mm-dd` -- which IS the wire
 * format, so no parsing layer is needed. A custom popover at 390px would also have
 * to fight the on-screen keyboard for space.
 */
export function DateInput({ className, ...rest }: DateInputProps) {
  return <input type="date" className={cn(CONTROL_CLASSES, className)} {...rest} />;
}

export type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function TextArea({ className, rows = 3, ...rest }: TextAreaProps) {
  return (
    <textarea
      rows={rows}
      className={cn(CONTROL_CLASSES, 'resize-y leading-relaxed', className)}
      {...rest}
    />
  );
}

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export interface SelectInputProps
  extends SelectHTMLAttributes<HTMLSelectElement> {
  readonly options: readonly SelectOption[];
  readonly placeholder?: string;
}

/**
 * A native select. Used for defect type (five options) but NOT for severity: the
 * split is by option count and consequence, not a blanket rule. Five chips wrap
 * awkwardly at 390px, whereas severity is the most consequential field on the form
 * and deserves to be readable at a glance.
 */
export function SelectInput({
  options,
  placeholder,
  className,
  ...rest
}: SelectInputProps) {
  return (
    <select className={cn(CONTROL_CLASSES, 'appearance-none pr-8', className)} {...rest}>
      {placeholder ? (
        <option value="">{placeholder}</option>
      ) : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
