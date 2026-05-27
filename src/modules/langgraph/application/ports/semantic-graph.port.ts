import type { RetrievedContext } from '../../../../shared/types/semantic-pipeline.type';

export interface SemanticGraphPort {
  plan(question: string): Promise<string[]>;
  synthesize(question: string, contexts: RetrievedContext[]): Promise<string>;
}
