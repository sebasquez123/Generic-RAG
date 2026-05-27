import type { RetrievedContext } from '../../../../shared/types/semantic-pipeline.type';
export interface SemanticGraphState {
    question: string;
    contexts: RetrievedContext[];
    trace: string[];
}
