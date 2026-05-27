import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
} from '@nestjs/common';
import { RagOrchestratorService } from '../../application/services/rag-orchestrator.service';
import type { AskRagDto } from '../dto/ask-rag.dto';
import { askRagSchema } from '../validators/ask-rag.schema';

@Controller('rag')
export class RagController {
  constructor(private readonly ragOrchestrator: RagOrchestratorService) {}

  @Get('lineup')
  getLineup() {
    return {
      purpose: 'Autonomous RAG API module composition',
      activeModelAdapters: ['gpt'],
      plannedModelAdapters: ['gemini', 'claude', 'deepseek'],
      memoryModule: 'vector-memory/postgres-pgvector',
      graphModule: 'langgraph/langchain',
      ingestionModule: 'ingestion/pdf-first',
      moderationModule: 'moderation/request-policy',
    };
  }

  @Post('ask')
  ask(@Body() body: AskRagDto) {
    const parsed = askRagSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.ragOrchestrator.answer(
      parsed.data.question,
      parsed.data.contextLimit,
    );
  }
}
