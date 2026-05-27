"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryModule = void 0;
const common_1 = require("@nestjs/common");
const retrieval_module_1 = require("../retrieval/retrieval.module");
const scoring_module_1 = require("../scoring/scoring.module");
const query_service_1 = require("./application/services/query.service");
const query_controller_1 = require("./presentation/controllers/query.controller");
let QueryModule = class QueryModule {
};
exports.QueryModule = QueryModule;
exports.QueryModule = QueryModule = __decorate([
    (0, common_1.Module)({
        imports: [retrieval_module_1.RetrievalModule, scoring_module_1.ScoringModule],
        controllers: [query_controller_1.QueryController],
        providers: [query_service_1.QueryService],
        exports: [query_service_1.QueryService],
    })
], QueryModule);
//# sourceMappingURL=query.module.js.map