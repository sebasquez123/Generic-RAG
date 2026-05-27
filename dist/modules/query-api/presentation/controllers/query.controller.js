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
exports.QueryController = void 0;
const common_1 = require("@nestjs/common");
const query_service_1 = require("../../application/services/query.service");
const fetch_query_schema_1 = require("../validators/fetch-query.schema");
let QueryController = class QueryController {
    queryService;
    constructor(queryService) {
        this.queryService = queryService;
    }
    getLineup() {
        return {
            purpose: 'Query module data fetching',
            retrievalModule: 'retrieval/postgres-pgvector',
            scoringModule: 'scoring/context-rank',
            storageModule: 'storage/postgres-pgvector',
        };
    }
    fetch(body) {
        const parsed = fetch_query_schema_1.fetchQuerySchema.safeParse(body);
        if (!parsed.success) {
            throw new common_1.BadRequestException(parsed.error.flatten());
        }
        return this.queryService.fetchContexts(parsed.data.question, parsed.data.contextLimit);
    }
};
exports.QueryController = QueryController;
__decorate([
    (0, common_1.Get)('lineup'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], QueryController.prototype, "getLineup", null);
__decorate([
    (0, common_1.Post)('fetch'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Function]),
    __metadata("design:returntype", void 0)
], QueryController.prototype, "fetch", null);
exports.QueryController = QueryController = __decorate([
    (0, common_1.Controller)('query'),
    __metadata("design:paramtypes", [query_service_1.QueryService])
], QueryController);
//# sourceMappingURL=query.controller.js.map