import { Inject, Injectable } from '@nestjs/common';
import type {
  ModelInference,
  RetrievedContext,
} from '../../../RAG/types/rag-shared.type';
import { RAG_GRAPH_ADAPTER } from '../ports/langgraph.tokens';
import type { RagGraphPort } from '../ports/rag-graph.port';

@Injectable()
export class RagGraphOrchestratorService implements RagGraphPort {
  constructor(
    @Inject(RAG_GRAPH_ADAPTER)
    private readonly graphAdapter: RagGraphPort,
  ) {}

  plan(question: string): Promise<string[]> {
    return this.graphAdapter.plan(question);
  }

  synthesize(
    question: string,
    contexts: RetrievedContext[],
    inferences: ModelInference[],
  ): Promise<string> {
    return this.graphAdapter.synthesize(question, contexts, inferences);
  }
}
