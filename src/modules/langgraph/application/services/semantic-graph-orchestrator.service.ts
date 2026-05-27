import { Inject, Injectable } from '@nestjs/common';
import type { RetrievedContext } from '../../../../shared/types/semantic-pipeline.type';
import { SEMANTIC_GRAPH_ADAPTER } from '../ports/langgraph.tokens';
import type { SemanticGraphPort } from '../ports/semantic-graph.port';

@Injectable()
export class SemanticGraphOrchestratorService implements SemanticGraphPort {
  constructor(
    @Inject(SEMANTIC_GRAPH_ADAPTER)
    private readonly graphAdapter: SemanticGraphPort,
  ) {}

  // Next step: expose ingestion-specific graph methods instead of the older
  // query/synthesis names once the PDF and structured-data nodes are real.
  plan(question: string): Promise<string[]> {
    return this.graphAdapter.plan(question);
  }

  synthesize(question: string, contexts: RetrievedContext[]): Promise<string> {
    return this.graphAdapter.synthesize(question, contexts);
  }
}
