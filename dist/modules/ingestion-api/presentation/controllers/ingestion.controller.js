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
exports.IngestionController = void 0;
const common_1 = require("@nestjs/common");
const document_ingestion_service_1 = require("../../application/services/document-ingestion.service");
const ingest_text_schema_1 = require("../validators/ingest-text.schema");
let IngestionController = class IngestionController {
    documentIngestion;
    constructor(documentIngestion) {
        this.documentIngestion = documentIngestion;
    }
    getLineup() {
        return {
            purpose: 'Ingestion API module composition',
            ingestionModule: 'ingestion/text-and-pdf',
            embeddingModule: 'embedding/text-to-vector',
            storageModule: 'storage/postgres-pgvector',
        };
    }
    ingestText(body) {
        const parsed = ingest_text_schema_1.ingestTextSchema.safeParse(body);
        if (!parsed.success) {
            throw new common_1.BadRequestException(parsed.error.flatten());
        }
        return this.documentIngestion.ingestText(parsed.data);
    }
};
exports.IngestionController = IngestionController;
__decorate([
    (0, common_1.Get)('lineup'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], IngestionController.prototype, "getLineup", null);
__decorate([
    (0, common_1.Post)('text'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Function]),
    __metadata("design:returntype", void 0)
], IngestionController.prototype, "ingestText", null);
exports.IngestionController = IngestionController = __decorate([
    (0, common_1.Controller)('ingestion'),
    __metadata("design:paramtypes", [document_ingestion_service_1.DocumentIngestionService])
], IngestionController);
//# sourceMappingURL=ingestion.controller.js.map