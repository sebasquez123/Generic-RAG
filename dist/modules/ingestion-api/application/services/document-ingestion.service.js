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
exports.DocumentIngestionService = void 0;
const common_1 = require("@nestjs/common");
const embedding_service_1 = require("../../../embedding/application/embedding.service");
const storage_service_1 = require("../../../storage/application/services/storage.service");
let DocumentIngestionService = class DocumentIngestionService {
    embedding;
    storage;
    constructor(embedding, storage) {
        this.embedding = embedding;
        this.storage = storage;
    }
    async ingestText(input) {
        const chunks = this.chunk(input.content);
        const embeddedChunks = chunks.map((content) => ({
            source: input.source,
            content,
            embedding: this.embedding.embed(content),
        }));
        const stored = await this.storage.storeDocumentChunks(embeddedChunks);
        return {
            source: input.source,
            chunkCount: embeddedChunks.length,
            embeddedChunks,
            stored,
        };
    }
    chunk(content) {
        return content
            .split(/\n{2,}/)
            .map((chunk) => chunk.trim())
            .filter((chunk) => chunk.length > 0);
    }
};
exports.DocumentIngestionService = DocumentIngestionService;
exports.DocumentIngestionService = DocumentIngestionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [embedding_service_1.EmbeddingService,
        storage_service_1.StorageService])
], DocumentIngestionService);
//# sourceMappingURL=document-ingestion.service.js.map