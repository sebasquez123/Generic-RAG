import { z } from 'zod';

export const askRagSchema = z.object({
  question: z.string().trim().min(1, 'question is required'),
  contextLimit: z.number().int().min(1).max(10).optional(),
});

export type AskRagInput = z.infer<typeof askRagSchema>;
