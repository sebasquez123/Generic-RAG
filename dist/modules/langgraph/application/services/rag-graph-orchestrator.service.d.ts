import type { ModelInference, RetrievedContext } from '../../../shared/types/rag-shared.type';
import type { RagGraphPort } from '../ports/rag-graph.port';
export declare class RagGraphOrchestratorService implements RagGraphPort {
    private readonly graphAdapter;
    constructor(graphAdapter: RagGraphPort);
    plan(question: string): Promise<string[]>;
    synthesize(question: string, contexts: RetrievedContext[], inferences: ModelInference[]): Promise<string>;
}
