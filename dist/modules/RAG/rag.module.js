"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RagModule = void 0;
const common_1 = require("@nestjs/common");
const ai_module_1 = require("../ai/ai.module");
const langgraph_module_1 = require("../langgraph/langgraph.module");
const vector_memory_module_1 = require("../vector-memory/vector-memory.module");
const rag_orchestrator_service_1 = require("./application/services/rag-orchestrator.service");
const rag_controller_1 = require("./presentation/controllers/rag.controller");
let RagModule = class RagModule {
};
exports.RagModule = RagModule;
exports.RagModule = RagModule = __decorate([
    (0, common_1.Module)({
        imports: [ai_module_1.AiModule, langgraph_module_1.LanggraphModule, vector_memory_module_1.VectorMemoryModule],
        controllers: [rag_controller_1.RagController],
        providers: [rag_orchestrator_service_1.RagOrchestratorService],
    })
], RagModule);
//# sourceMappingURL=rag.module.js.map