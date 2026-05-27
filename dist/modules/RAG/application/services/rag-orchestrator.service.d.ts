import { LlmModelSelectorService } from '../../../ai/application/services/llm-model-selector.service';
import { RagGraphOrchestratorService } from '../../../langgraph/application/services/rag-graph-orchestrator.service';
import { VectorMemoryService } from '../../../vector-memory/application/services/vector-memory.service';
import type { RagAnswer } from '../../domain/types/rag-answer.type';
export declare class RagOrchestratorService {
    private readonly vectorMemory;
    private readonly llmModelSelector;
    private readonly ragGraph;
    private readonly ragPolicy;
    constructor(vectorMemory: VectorMemoryService, llmModelSelector: LlmModelSelectorService, ragGraph: RagGraphOrchestratorService);
    answer(question: string, contextLimit?: number): Promise<RagAnswer>;
}
