import type { RetrievedContext } from '../../../../shared/types/semantic-pipeline.type';
import type { SemanticGraphPort } from '../ports/semantic-graph.port';
export declare class SemanticGraphOrchestratorService implements SemanticGraphPort {
    private readonly graphAdapter;
    constructor(graphAdapter: SemanticGraphPort);
    plan(question: string): Promise<string[]>;
    synthesize(question: string, contexts: RetrievedContext[]): Promise<string>;
}
