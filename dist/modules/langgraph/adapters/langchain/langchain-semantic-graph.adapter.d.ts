import type { SemanticGraphPort } from '../../application/ports/semantic-graph.port';
import type { RetrievedContext } from '../../../../shared/types/semantic-pipeline.type';
export declare class LangchainSemanticGraphAdapter implements SemanticGraphPort {
    plan(question: string): Promise<string[]>;
    synthesize(question: string, contexts: RetrievedContext[]): Promise<string>;
}
