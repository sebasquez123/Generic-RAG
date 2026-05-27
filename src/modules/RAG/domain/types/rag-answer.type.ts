import type {
  ModelInference,
  RetrievedContext,
} from '../../types/rag-shared.type';

export interface RagAnswer {
  question: string;
  synthesizedAnswer: string;
  contexts: RetrievedContext[];
  inferences: ModelInference[];
  graphTrace: string[];
}
