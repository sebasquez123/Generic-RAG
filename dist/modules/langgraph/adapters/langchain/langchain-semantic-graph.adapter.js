"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LangchainSemanticGraphAdapter = void 0;
const common_1 = require("@nestjs/common");
let LangchainSemanticGraphAdapter = class LangchainSemanticGraphAdapter {
    plan(question) {
        return Promise.resolve([
            `receive-question:${question}`,
            'route-source:pdf-or-structured-data',
            'format-content:formatter-module',
            'embed-content:embedding-module',
            'store-content:storage-module',
        ]);
    }
    synthesize(question, contexts) {
        return Promise.resolve([
            `Semantic context summary for: ${question}`,
            `Retrieved contexts: ${contexts.length}.`,
        ].join(' '));
    }
};
exports.LangchainSemanticGraphAdapter = LangchainSemanticGraphAdapter;
exports.LangchainSemanticGraphAdapter = LangchainSemanticGraphAdapter = __decorate([
    (0, common_1.Injectable)()
], LangchainSemanticGraphAdapter);
//# sourceMappingURL=langchain-semantic-graph.adapter.js.map