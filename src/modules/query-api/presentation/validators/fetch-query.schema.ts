import { z } from 'zod';

export const fetchQuerySchema = z.object({
  question: z.string().trim().min(1),
  contextLimit: z.number().int().min(1).max(10).optional(),
});

export type FetchQueryInput = z.infer<typeof fetchQuerySchema>;
