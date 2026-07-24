
import z from 'zod';

export type IngestStructuredDto = z.infer<typeof ingestStructuredSchema>;

export const ingestStructuredSchema = z.object({
  source: z.string().trim().min(1, 'source is required'),
  data: z.any().refine(
    (value) => value !== null && value !== undefined,
    { message: 'data is required' },
  ),
});

