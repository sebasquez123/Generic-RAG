"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const database_module_1 = require("./modules/database/database.module");
const embedding_module_1 = require("./modules/embedding/embedding.module");
const formatter_module_1 = require("./modules/formatter/formatter.module");
const ingestion_module_1 = require("./modules/ingestion-api/ingestion.module");
const moderation_module_1 = require("./modules/moderation/moderation.module");
const query_module_1 = require("./modules/query-api/query.module");
const retrieval_module_1 = require("./modules/retrieval/retrieval.module");
const scoring_module_1 = require("./modules/scoring/scoring.module");
const storage_module_1 = require("./modules/storage/storage.module");
const user_context_middleware_1 = require("./shared/middleware/user-context/user-context.middleware");
let AppModule = class AppModule {
    configure(consumer) {
        consumer.apply(user_context_middleware_1.UserContextMiddleware).forRoutes('*');
    }
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            database_module_1.DatabaseModule,
            embedding_module_1.EmbeddingModule,
            formatter_module_1.FormatterModule,
            ingestion_module_1.IngestionModule,
            moderation_module_1.ModerationModule,
            query_module_1.QueryModule,
            retrieval_module_1.RetrievalModule,
            scoring_module_1.ScoringModule,
            storage_module_1.StorageModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map