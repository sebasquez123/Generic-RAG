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
exports.QueryService = void 0;
const common_1 = require("@nestjs/common");
const retrieval_service_1 = require("../../../retrieval/application/services/retrieval.service");
const scoring_service_1 = require("../../../scoring/application/services/scoring.service");
const query_policy_service_1 = require("../../domain/services/query-policy.service");
let QueryService = class QueryService {
    retrieval;
    scoring;
    policy = new query_policy_service_1.QueryPolicyService();
    constructor(retrieval, scoring) {
        this.retrieval = retrieval;
        this.scoring = scoring;
    }
    normalize(question, contextLimit = 5) {
        return this.policy.normalize(question, contextLimit);
    }
    async fetchContexts(question, contextLimit = 5) {
        const query = this.normalize(question, contextLimit);
        const contexts = await this.retrieval.retrieve(query.question, query.contextLimit);
        return this.scoring.scoreContexts(contexts);
    }
};
exports.QueryService = QueryService;
exports.QueryService = QueryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [retrieval_service_1.RetrievalService,
        scoring_service_1.ScoringService])
], QueryService);
//# sourceMappingURL=query.service.js.map