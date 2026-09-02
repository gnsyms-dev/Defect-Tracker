import { z } from 'zod';

/**
 * The backend wraps EVERY response -- success and error alike -- in this envelope.
 * There is no auto-wrapping interceptor on the server; each controller builds it.
 */
export const ResponseCode = {
  Ok: '2000',
  Created: '2010',
  NoContent: '2040',
  BadRequest: '4000',
  Unauthorized: '4010',
  Forbidden: '4030',
  NotFound: '4040',
  Conflict: '4090',
  UnprocessableEntity: '4220',
  TooManyRequests: '4290',
  InternalServerError: '5000',
} as const;

// A const object plus a union type, not a TS enum: tsconfig sets
// erasableSyntaxOnly, which bans enums outright on the frontend.
export type ResponseCode = (typeof ResponseCode)[keyof typeof ResponseCode];

/**
 * Builds a schema for the envelope around a given `data` schema.
 *
 * `data` is optional in the envelope, so endpoints returning nothing pass
 * `z.undefined()`.
 */
export function envelopeSchema<T extends z.ZodType>(dataSchema: T) {
  return z.object({
    status: z.boolean(),
    code: z.string(),
    message: z.string(),
    data: dataSchema.optional(),
  });
}

/** The error envelope's `data` payload, from GlobalExceptionFilter. */
export const errorEnvelopeSchema = z.object({
  status: z.literal(false),
  code: z.string(),
  message: z.string(),
  data: z
    .object({
      path: z.string().optional(),
      timestamp: z.string().optional(),
      stack: z.string().optional(),
    })
    .optional(),
});
