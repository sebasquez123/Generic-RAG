import { z } from 'zod';
export declare const fetchQuerySchema: z.ZodObject<{
    question: z.ZodString;
    contextLimit: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type FetchQueryInput = z.infer<typeof fetchQuerySchema>;
