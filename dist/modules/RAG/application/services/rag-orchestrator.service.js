"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RagOrchestratorService = void 0;
const common_1 = require("@nestjs/common");
const llm_model_selector_service_1 = require("../../../ai/application/services/llm-model-selector.service");
const rag_graph_orchestrator_service_1 = require("../../../langgraph/application/services/rag-graph-orchestrator.service");
const vector_memory_service_1 = require("../../../vector-memory/application/services/vector-memory.service");
const rag_policy_service_1 = require("../../domain/services/rag-policy.service");
let RagOrchestratorService = class RagOrchestratorService {
    vectorMemory;
    llmModelSelector;
    ragGraph;
    ragPolicy = new rag_policy_service_1.RagPolicyService();
    constructor(vectorMemory, llmModelSelector, ragGraph) {
        this.vectorMemory = vectorMemory;
        this.llmModelSelector = llmModelSelector;
        this.ragGraph = ragGraph;
    }
    async answer(question, contextLimit = 5) {
        const query = this.ragPolicy.normalizeQuery(question, contextLimit);
        const graphTrace = await this.ragGraph.plan(query.question);
        const contexts = await this.vectorMemory.retrieve(query.question, query.contextLimit);
        const inferences = await this.llmModelSelector.infer({
            question: query.question,
            contexts,
            provider: 'gpt',
        });
        const synthesizedAnswer = await this.ragGraph.synthesize(query.question, contexts, inferences);
        return {
            question: query.question,
            synthesizedAnswer,
            contexts,
            inferences,
            graphTrace,
        };
    }
};
exports.RagOrchestratorService = RagOrchestratorService;
exports.RagOrchestratorService = RagOrchestratorService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [vector_memory_service_1.VectorMemoryService,
        llm_model_selector_service_1.LlmModelSelectorService,
        rag_graph_orchestrator_service_1.RagGraphOrchestratorService])
], RagOrchestratorService);
//# sourceMappingURL=rag-orchestrator.service.js.map