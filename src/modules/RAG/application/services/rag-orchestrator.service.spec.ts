import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseModule } from '../../../database/database.module';
import { RagModule } from '../../rag.module';
import { RagOrchestratorService } from './rag-orchestrator.service';

describe('RagOrchestratorService', () => {
  let service: RagOrchestratorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [DatabaseModule, RagModule],
    }).compile();

    service = module.get<RagOrchestratorService>(RagOrchestratorService);
  });

  it('orchestrates retrieval, model selection, and graph synthesis', async () => {
    const answer = await service.answer(
      'How should agents ground an answer?',
      2,
    );

    expect(answer.contexts).toHaveLength(2);
    expect(answer.inferences.map((inference) => inference.provider)).toEqual([
      'gpt',
    ]);
    expect(answer.synthesizedAnswer).toContain('RAG synthesis');
  });
});
