import { BadRequestException } from '@nestjs/common';
import type { ZodType, ZodTypeDef } from 'zod';

/** Boundary validation helper: invalid input becomes a 400 with field errors. */
export function parseOrThrow<T>(
  schema: ZodType<T, ZodTypeDef, unknown>,
  input: unknown,
): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
  return parsed.data;
}
