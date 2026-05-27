import { Injectable } from '@nestjs/common';
import { LlmModelSelectorService } from '../../../ai/application/services/llm-model-selector.service';
import { RagGraphOrchestratorService } from '../../../langgraph/application/services/rag-graph-orchestrator.service';
import { VectorMemoryService } from '../../../vector-memory/application/services/vector-memory.service';
import { RagPolicyService } from '../../domain/services/rag-policy.service';
import type { RagAnswer } from '../../domain/types/rag-answer.type';

@Injectable()
export class RagOrchestratorService {
  private readonly ragPolicy = new RagPolicyService();

  constructor(
    private readonly vectorMemory: VectorMemoryService,
    private readonly llmModelSelector: LlmModelSelectorService,
    private readonly ragGraph: RagGraphOrchestratorService,
  ) {}

  async answer(question: string, contextLimit = 5): Promise<RagAnswer> {
    const query = this.ragPolicy.normalizeQuery(question, contextLimit);
    const graphTrace = await this.ragGraph.plan(query.question);
    const contexts = await this.vectorMemory.retrieve(
      query.question,
      query.contextLimit,
    );
    const inferences = await this.llmModelSelector.infer({
      question: query.question,
      contexts,
      provider: 'gpt',
    });
    const synthesizedAnswer = await this.ragGraph.synthesize(
      query.question,
      contexts,
      inferences,
    );

    return {
      question: query.question,
      synthesizedAnswer,
      contexts,
      inferences,
      graphTrace,
    };
  }
}
