import type { ModelInference, RetrievedContext } from '../../../shared/types/rag-shared.type';
export interface RagGraphState {
    question: string;
    contexts: RetrievedContext[];
    inferences: ModelInference[];
    trace: string[];
}
