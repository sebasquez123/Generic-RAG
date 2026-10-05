import z from 'zod';
import { DocumentType } from '~/shared/types/semantic-pipeline.type';
import { namespaceSchema } from '~/shared/validation/common.schema';

const stringList = z.array(z.string().trim().min(1)).max(100);

export const searchSchema = z
  .object({
    query: z.string().trim().min(1, 'query is required').max(4000),
    top_k: z.number().int().min(1).optional(),
    min_score: z.number().min(-1).max(1).optional(),
    namespace: namespaceSchema.optional(),
    order_by: z.enum(['score', 'document']).optional(),
    mode: z.enum(['hybrid', 'vector']).optional(),
    filters: z
      .object({
        document_ids: z.array(z.string().uuid()).max(100).optional(),
        document_types: z.array(z.nativeEnum(DocumentType)).optional(),
        sources: stringList.optional(),
        tags: stringList.optional(),
        sheets: stringList.optional(),
        metadata: z.record(z.unknown()).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type SearchInput = z.infer<typeof searchSchema>;
