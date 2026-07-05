export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
export const LLM_PROVIDER_CONFIG = Symbol('LLM_PROVIDER_CONFIG');

export interface LlmConfig {
  CHUNKING_PROVIDER: string,
  CHUNKING_PROMPT: string,
  EMBEDDING_PROVIDER: string,
  EMBEDDING_PROMPT: string,
  API_KEY: string,
  FORMAT_DEMANDED: string,
  BASE_URL: string
  PROVIDER_NAME: string,
}

export enum LlmChunkingProviderName {
  gemini,
  openai,
  huggingface,
}

export interface ChunkTextInput {
  text: string;
  source: string;
  maxChunkLength?: number;
}

export interface LlmPort {
  readonly providerName: LlmChunkingProviderName;
  embedText(input: string): Promise<number[] | undefined>;
}
