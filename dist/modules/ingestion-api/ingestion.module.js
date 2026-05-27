"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IngestionModule = void 0;
const common_1 = require("@nestjs/common");
const embedding_module_1 = require("../embedding/embedding.module");
const storage_module_1 = require("../storage/storage.module");
const pdf_ingestion_adapter_1 = require("./adapters/pdf/pdf-ingestion.adapter");
const document_ingestion_service_1 = require("./application/services/document-ingestion.service");
const ingestion_controller_1 = require("./presentation/controllers/ingestion.controller");
let IngestionModule = class IngestionModule {
};
exports.IngestionModule = IngestionModule;
exports.IngestionModule = IngestionModule = __decorate([
    (0, common_1.Module)({
        imports: [embedding_module_1.EmbeddingModule, storage_module_1.StorageModule],
        controllers: [ingestion_controller_1.IngestionController],
        providers: [document_ingestion_service_1.DocumentIngestionService, pdf_ingestion_adapter_1.PdfIngestionAdapter],
        exports: [document_ingestion_service_1.DocumentIngestionService],
    })
], IngestionModule);
//# sourceMappingURL=ingestion.module.js.map