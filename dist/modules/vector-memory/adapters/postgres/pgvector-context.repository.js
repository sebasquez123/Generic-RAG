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
exports.PgVectorContextRepository = void 0;
const common_1 = require("@nestjs/common");
const pg_vector_connection_service_1 = require("../../../database/vector/pg-vector-connection.service");
let PgVectorContextRepository = class PgVectorContextRepository {
    vectorConnection;
    constructor(vectorConnection) {
        this.vectorConnection = vectorConnection;
    }
    async retrieve(question, limit) {
        const normalizedLimit = Math.max(1, Math.min(limit, 10));
        if (!this.vectorConnection.isConfigured()) {
            return this.stubContexts(question, normalizedLimit);
        }
        return this.vectorConnection.searchSimilarContexts(question, normalizedLimit);
    }
    stubContexts(question, limit) {
        return Array.from({ length: limit }, (_, index) => ({
            id: `ctx-${index + 1}`,
            source: `pgvector://knowledge-base/${index + 1}`,
            content: `Candidate context ${index + 1} retrieved for "${question}".`,
            score: Number((0.88 - index * 0.04).toFixed(2)),
        }));
    }
};
exports.PgVectorContextRepository = PgVectorContextRepository;
exports.PgVectorContextRepository = PgVectorContextRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [pg_vector_connection_service_1.PgVectorConnectionService])
], PgVectorContextRepository);
//# sourceMappingURL=pgvector-context.repository.js.map