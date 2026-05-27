import { z } from 'zod';
export declare const askRagSchema: z.ZodObject<{
    question: z.ZodString;
    contextLimit: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type AskRagInput = z.infer<typeof askRagSchema>;
