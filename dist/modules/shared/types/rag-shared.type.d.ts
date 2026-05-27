export type SupportedModelProvider = 'gemini' | 'gpt' | 'claude' | 'deepseek';
export interface RetrievedContext {
    id: string;
    source: string;
    content: string;
    score: number;
}
export interface ModelInference {
    provider: SupportedModelProvider;
    answer: string;
    confidence: number;
}
