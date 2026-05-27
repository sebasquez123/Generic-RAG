import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { LanggraphModule } from '../langgraph/langgraph.module';
import { VectorMemoryModule } from '../vector-memory/vector-memory.module';
import { RagOrchestratorService } from './application/services/rag-orchestrator.service';
import { RagController } from './presentation/controllers/rag.controller';

@Module({
  imports: [AiModule, LanggraphModule, VectorMemoryModule],
  controllers: [RagController],
  providers: [RagOrchestratorService],
})
export class RagModule {}
