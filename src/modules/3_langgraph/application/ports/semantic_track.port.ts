import type { RetrievedContext } from '../../../../shared/types/semantic-pipeline.type';

export const SEMANTIC_TRACKING_ADAPTER = Symbol('SEMANTIC_TRACKING_ADAPTER');

export interface TrackingLangChainPort {
    plan(question: string): Promise<string[]>;
    synthesize(question: string, contexts: RetrievedContext[]): Promise<string>;
}
