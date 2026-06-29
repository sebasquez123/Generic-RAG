import z from 'zod';

export const ingestTextSchema = z.object({
  source: z.string().trim().min(1, 'source is required'),
  content: z.string().trim().min(1, 'content is required')
});
