import type { ModelInference, RetrievedContext, SupportedModelProvider } from '../../../shared/types/rag-shared.type';
export interface StandardLlmRequest {
    question: string;
    contexts: RetrievedContext[];
    provider?: SupportedModelProvider;
}
export type StandardLlmResponse = ModelInference;
