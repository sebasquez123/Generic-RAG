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
exports.SemanticGraphOrchestratorService = void 0;
const common_1 = require("@nestjs/common");
const langgraph_tokens_1 = require("../ports/langgraph.tokens");
let SemanticGraphOrchestratorService = class SemanticGraphOrchestratorService {
    graphAdapter;
    constructor(graphAdapter) {
        this.graphAdapter = graphAdapter;
    }
    plan(question) {
        return this.graphAdapter.plan(question);
    }
    synthesize(question, contexts) {
        return this.graphAdapter.synthesize(question, contexts);
    }
};
exports.SemanticGraphOrchestratorService = SemanticGraphOrchestratorService;
exports.SemanticGraphOrchestratorService = SemanticGraphOrchestratorService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(langgraph_tokens_1.SEMANTIC_GRAPH_ADAPTER)),
    __metadata("design:paramtypes", [Object])
], SemanticGraphOrchestratorService);
//# sourceMappingURL=semantic-graph-orchestrator.service.js.map