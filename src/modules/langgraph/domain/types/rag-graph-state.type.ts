import type {
  ModelInference,
  RetrievedContext,
} from '../../../RAG/types/rag-shared.type';

export interface RagGraphState {
  question: string;
  contexts: RetrievedContext[];
  inferences: ModelInference[];
  trace: string[];
}
