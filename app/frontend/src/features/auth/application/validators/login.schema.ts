import { z } from 'zod';

/**
 * Client-side validation carries the ENTIRE field-level UX here.
 *
 * The backend's GlobalExceptionFilter comma-joins class-validator messages into a
 * single string, so field-level errors are genuinely not recoverable from a server
 * response -- there is nothing to map back onto inputs. Server errors therefore
 * render as a form-level banner, and everything per-field has to be caught here.
 */
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email address')
    .email('Enter a valid email address')
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1, 'Enter your password'),
});

export type LoginFormValues = z.input<typeof loginSchema>;
export type LoginFormOutput = z.output<typeof loginSchema>;
