import { RagOrchestratorService } from '../../application/services/rag-orchestrator.service';
import type { AskRagDto } from '../dto/ask-rag.dto';
export declare class RagController {
    private readonly ragOrchestrator;
    constructor(ragOrchestrator: RagOrchestratorService);
    getLineup(): {
        purpose: string;
        activeModelAdapters: string[];
        plannedModelAdapters: string[];
        memoryModule: string;
        graphModule: string;
        ingestionModule: string;
        moderationModule: string;
    };
    ask(body: AskRagDto): Promise<import("../../domain/types/rag-answer.type").RagAnswer>;
}
