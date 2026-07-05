export interface Tokenizer {
    encode(input: string): number[] | Promise<number[]>;
    decode(tokens: number[]): string | Promise<string>;
}

export interface TransformersModule {
    AutoTokenizer: {
        from_pretrained(
            model: string,
            options: { local_files_only: boolean },
        ): Promise<unknown>;
    };
}