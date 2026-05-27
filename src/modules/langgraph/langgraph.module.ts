import { Module } from '@nestjs/common';
import { LangchainRagGraphAdapter } from './adapters/langchain/langchain-rag-graph.adapter';
import { RAG_GRAPH_ADAPTER } from './application/ports/langgraph.tokens';
import { RagGraphOrchestratorService } from './application/services/rag-graph-orchestrator.service';

@Module({
  providers: [
    LangchainRagGraphAdapter,
    RagGraphOrchestratorService,
    {
      provide: RAG_GRAPH_ADAPTER,
      useExisting: LangchainRagGraphAdapter,
    },
  ],
  exports: [RagGraphOrchestratorService],
})
export class LanggraphModule {}
