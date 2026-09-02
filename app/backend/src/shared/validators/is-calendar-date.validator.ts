import { registerDecorator } from 'class-validator';
import type { ValidationOptions } from 'class-validator';

const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True only for a real calendar date in strict `YYYY-MM-DD` form.
 *
 * Neither obvious alternative is correct here:
 *  - `@IsDateString()` also accepts full ISO datetimes (`2026-09-01T12:00:00Z`),
 *    which would let a timestamp reach a DATE column and silently lose its time.
 *  - A bare `@Matches(/^\d{4}-\d{2}-\d{2}$/)` accepts `2026-02-31`, which Postgres
 *    then rejects -- surfacing a user input error as a 500 instead of a 400.
 *
 * The round-trip check below is what rejects impossible days: `new Date('2026-02-31')`
 * rolls over to 2026-03-03, so re-formatting it no longer matches the input.
 */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !CALENDAR_DATE_PATTERN.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed.toISOString().slice(0, 10) === value;
}

export function IsCalendarDate(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (target: object, propertyName: string | symbol): void => {
    registerDecorator({
      name: 'isCalendarDate',
      target: target.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate: (value: unknown): boolean => isCalendarDate(value),
        defaultMessage: (): string =>
          'must be a valid calendar date in YYYY-MM-DD format',
      },
    });
  };
}
