import type { SafeParseResult } from '../../../../shared/validation/safe-parse';
import { validationError } from '../../../../shared/validation/safe-parse';
import z from 'zod';

export interface IngestPdfInput {
  source: string;
  file: {
    buffer: Buffer;
    originalname: string;
    mimetype?: string;
  };
}

export const ingestPdfSchema = z.object({
  source: z.string().trim().min(1, 'source is required'),
  file: z.object({
    buffer: z.instanceof(Buffer, {
      message: 'file is required',
    }),
    originalname: z.string().min(1, 'file original name is required'),
    mimetype: z.string().optional(),
  }),
});

