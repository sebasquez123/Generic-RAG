export interface GeminiChunkResponse {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

export interface GeminiEmbeddingResponse {
    embedding: {
        values?: number[] | undefined;
    } | undefined;
}