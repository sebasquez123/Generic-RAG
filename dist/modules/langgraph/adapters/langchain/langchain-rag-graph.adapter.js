"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LangchainRagGraphAdapter = void 0;
const common_1 = require("@nestjs/common");
let LangchainRagGraphAdapter = class LangchainRagGraphAdapter {
    plan(question) {
        return Promise.resolve([
            `receive-question:${question}`,
            'policy-check:moderation-module',
            'retrieve-context:vector-memory-module',
            'select-model:ai-module',
            'synthesize:langgraph-langchain',
        ]);
    }
    synthesize(question, contexts, inferences) {
        const bestInference = inferences.reduce((best, current) => !best || current.confidence > best.confidence ? current : best, undefined);
        return Promise.resolve([
            `RAG synthesis for: ${question}`,
            `Selected model signal: ${bestInference?.provider ?? 'none'}.`,
            `Retrieved contexts: ${contexts.length}.`,
        ].join(' '));
    }
};
exports.LangchainRagGraphAdapter = LangchainRagGraphAdapter;
exports.LangchainRagGraphAdapter = LangchainRagGraphAdapter = __decorate([
    (0, common_1.Injectable)()
], LangchainRagGraphAdapter);
//# sourceMappingURL=langchain-rag-graph.adapter.js.map