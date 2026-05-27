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
exports.PgVectorConnectionService = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
let PgVectorConnectionService = class PgVectorConnectionService {
    pool;
    constructor() {
        const connectionString = process.env.RAG_VECTOR_DATABASE_URL;
        if (connectionString) {
            this.pool = new pg_1.Pool({ connectionString });
        }
    }
    isConfigured() {
        return Boolean(this.pool);
    }
    async searchSimilarContexts(question, limit) {
        if (!this.pool) {
            return [];
        }
        const result = await this.pool.query(`
        select
          id::text,
          source,
          content,
          0::float as score
        from rag_documents
        where content ilike $1
        limit $2
      `, [`%${question}%`, limit]);
        return result.rows;
    }
    async onModuleDestroy() {
        await this.pool?.end();
    }
};
exports.PgVectorConnectionService = PgVectorConnectionService;
exports.PgVectorConnectionService = PgVectorConnectionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], PgVectorConnectionService);
//# sourceMappingURL=pg-vector-connection.service.js.map