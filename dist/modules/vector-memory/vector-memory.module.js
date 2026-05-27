"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectorMemoryModule = void 0;
const common_1 = require("@nestjs/common");
const database_module_1 = require("../database/database.module");
const pgvector_context_repository_1 = require("./adapters/postgres/pgvector-context.repository");
const vector_memory_tokens_1 = require("./application/ports/vector-memory.tokens");
const vector_memory_service_1 = require("./application/services/vector-memory.service");
let VectorMemoryModule = class VectorMemoryModule {
};
exports.VectorMemoryModule = VectorMemoryModule;
exports.VectorMemoryModule = VectorMemoryModule = __decorate([
    (0, common_1.Module)({
        imports: [database_module_1.DatabaseModule],
        providers: [
            vector_memory_service_1.VectorMemoryService,
            pgvector_context_repository_1.PgVectorContextRepository,
            {
                provide: vector_memory_tokens_1.VECTOR_CONTEXT_REPOSITORY,
                useExisting: pgvector_context_repository_1.PgVectorContextRepository,
            },
        ],
        exports: [vector_memory_service_1.VectorMemoryService],
    })
], VectorMemoryModule);
//# sourceMappingURL=vector-memory.module.js.map