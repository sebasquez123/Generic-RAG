import type {
  ModelInference,
  RetrievedContext,
} from '../../../RAG/types/rag-shared.type';

export interface RagGraphPort {
  plan(question: string): Promise<string[]>;
  synthesize(
    question: string,
    contexts: RetrievedContext[],
    inferences: ModelInference[],
  ): Promise<string>;
}
