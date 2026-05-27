import { z } from 'zod';

export const ingestTextSchema = z.object({
  source: z.string().trim().min(1),
  content: z.string().trim().min(1),
});

export type IngestTextInput = z.infer<typeof ingestTextSchema>;
