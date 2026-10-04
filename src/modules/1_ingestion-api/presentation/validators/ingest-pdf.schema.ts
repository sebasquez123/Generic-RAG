import z from 'zod';

export const ingestPdfSchema = z.object({
  source: z.string().trim().min(1, 'source is required'),
});
