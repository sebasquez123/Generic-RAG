import z from 'zod';

export const namespaceSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9_.:-]{1,64}$/,
    'namespace must be 1-64 chars of [A-Za-z0-9_.:-]',
  );

export const uuidSchema = z.string().uuid('id must be a UUID');

/** Multipart fields arrive as strings; JSON-encoded objects are accepted. */
export const jsonObjectField = z
  .union([z.string(), z.record(z.unknown())])
  .transform((value, context) => {
    if (typeof value !== 'string') return value;
    if (!value.trim()) return {};
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        return parsed as Record<string, unknown>;
    } catch {
      // handled below
    }
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'must be a JSON object',
    });
    return z.NEVER;
  });

/** Accepts ["a","b"], a JSON array string or "a, b". */
export const tagsField = z
  .union([z.string(), z.array(z.string())])
  .transform((value) => {
    let list: unknown = value;
    if (typeof value === 'string') {
      try {
        list = value.trim().startsWith('[')
          ? JSON.parse(value)
          : value.split(',');
      } catch {
        list = value.split(',');
      }
    }
    return (Array.isArray(list) ? list : [])
      .map((tag) => String(tag).trim())
      .filter(Boolean);
  })
  .pipe(z.array(z.string().max(64)).max(50));

export const booleanField = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');
