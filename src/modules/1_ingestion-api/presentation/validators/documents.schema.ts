import z from 'zod';
import {
  ChunkingStrategy,
  DocumentType,
  IngestionStatus,
} from '~/shared/types/semantic-pipeline.type';
import {
  booleanField,
  jsonObjectField,
  namespaceSchema,
  tagsField,
} from '~/shared/validation/common.schema';

export const uploadDocumentSchema = z.object({
  namespace: namespaceSchema.optional(),
  source: z.string().trim().max(500).optional(),
  document_type: z.nativeEnum(DocumentType).optional(),
  metadata: jsonObjectField.optional(),
  tags: tagsField.optional(),
  /** Start ingestion right after the upload (background). */
  ingest: booleanField.optional(),
});

export const chunkingOverridesSchema = z
  .object({
    strategy: z.nativeEnum(ChunkingStrategy).optional(),
    chunk_size: z.number().int().optional(),
    chunk_overlap: z.number().int().optional(),
    table_max_rows_per_chunk: z.number().int().optional(),
  })
  .strict();

export const ingestDocumentSchema = z
  .object({
    chunking: chunkingOverridesSchema.optional(),
    force: z.boolean().optional(),
    wait: z.boolean().optional(),
  })
  .strict();

export const listDocumentsSchema = z.object({
  namespace: namespaceSchema.optional(),
  status: z.nativeEnum(IngestionStatus).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const listChunksSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ChunkingOverridesInput = z.infer<typeof chunkingOverridesSchema>;
