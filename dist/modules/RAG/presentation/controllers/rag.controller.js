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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RagController = void 0;
const common_1 = require("@nestjs/common");
const rag_orchestrator_service_1 = require("../../application/services/rag-orchestrator.service");
const ask_rag_schema_1 = require("../validators/ask-rag.schema");
let RagController = class RagController {
    ragOrchestrator;
    constructor(ragOrchestrator) {
        this.ragOrchestrator = ragOrchestrator;
    }
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
    ask(body) {
        const parsed = ask_rag_schema_1.askRagSchema.safeParse(body);
        if (!parsed.success) {
            throw new common_1.BadRequestException(parsed.error.flatten());
        }
        return this.ragOrchestrator.answer(parsed.data.question, parsed.data.contextLimit);
    }
};
exports.RagController = RagController;
__decorate([
    (0, common_1.Get)('lineup'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], RagController.prototype, "getLineup", null);
__decorate([
    (0, common_1.Post)('ask'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Function]),
    __metadata("design:returntype", void 0)
], RagController.prototype, "ask", null);
exports.RagController = RagController = __decorate([
    (0, common_1.Controller)('rag'),
    __metadata("design:paramtypes", [rag_orchestrator_service_1.RagOrchestratorService])
], RagController);
//# sourceMappingURL=rag.controller.js.map