import type { ModelInference, RetrievedContext } from '../../../shared/types/rag-shared.type';
export interface RagGraphPort {
    plan(question: string): Promise<string[]>;
    synthesize(question: string, contexts: RetrievedContext[], inferences: ModelInference[]): Promise<string>;
}
