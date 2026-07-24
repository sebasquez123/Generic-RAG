export interface OpenAiChunkResponse {
    choices?: Array<{ message?: { content?: string } }>;
}

export interface OpenAiEmbeddingResponse {
    embedding: {
        values?: number[] | undefined;
    } | undefined;
}
