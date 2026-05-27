import { z } from 'zod';
export declare const ingestTextSchema: z.ZodObject<{
    source: z.ZodString;
    content: z.ZodString;
}, z.core.$strip>;
export type IngestTextInput = z.infer<typeof ingestTextSchema>;
