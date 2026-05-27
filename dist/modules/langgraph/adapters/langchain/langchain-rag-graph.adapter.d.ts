import type { RagGraphPort } from '../../application/ports/rag-graph.port';
import type { ModelInference, RetrievedContext } from '../../../shared/types/rag-shared.type';
export declare class LangchainRagGraphAdapter implements RagGraphPort {
    plan(question: string): Promise<string[]>;
    synthesize(question: string, contexts: RetrievedContext[], inferences: ModelInference[]): Promise<string>;
}
