import { Module } from '@nestjs/common';
import { LangchainSemanticGraphAdapter } from './adapters/langchain/langchain-semantic-graph.adapter';
import { SEMANTIC_GRAPH_ADAPTER } from './application/ports/langgraph.tokens';
import { SemanticGraphOrchestratorService } from './application/services/semantic-graph-orchestrator.service';

@Module({
  providers: [
    LangchainSemanticGraphAdapter,
    SemanticGraphOrchestratorService,
    {
      provide: SEMANTIC_GRAPH_ADAPTER,
      useExisting: LangchainSemanticGraphAdapter,
    },
  ],
  exports: [SemanticGraphOrchestratorService],
})
export class LanggraphModule {}
