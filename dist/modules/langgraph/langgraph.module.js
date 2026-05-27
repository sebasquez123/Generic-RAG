"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LanggraphModule = void 0;
const common_1 = require("@nestjs/common");
const langchain_rag_graph_adapter_1 = require("./adapters/langchain/langchain-rag-graph.adapter");
const langgraph_tokens_1 = require("./application/ports/langgraph.tokens");
const rag_graph_orchestrator_service_1 = require("./application/services/rag-graph-orchestrator.service");
let LanggraphModule = class LanggraphModule {
};
exports.LanggraphModule = LanggraphModule;
exports.LanggraphModule = LanggraphModule = __decorate([
    (0, common_1.Module)({
        providers: [
            langchain_rag_graph_adapter_1.LangchainRagGraphAdapter,
            rag_graph_orchestrator_service_1.RagGraphOrchestratorService,
            {
                provide: langgraph_tokens_1.RAG_GRAPH_ADAPTER,
                useExisting: langchain_rag_graph_adapter_1.LangchainRagGraphAdapter,
            },
        ],
        exports: [rag_graph_orchestrator_service_1.RagGraphOrchestratorService],
    })
], LanggraphModule);
//# sourceMappingURL=langgraph.module.js.map