"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiModule = void 0;
const common_1 = require("@nestjs/common");
const gpt_llm_adapter_1 = require("./adapters/gpt/gpt-llm.adapter");
const ai_tokens_1 = require("./application/ports/ai.tokens");
const llm_model_selector_service_1 = require("./application/services/llm-model-selector.service");
let AiModule = class AiModule {
};
exports.AiModule = AiModule;
exports.AiModule = AiModule = __decorate([
    (0, common_1.Module)({
        providers: [
            gpt_llm_adapter_1.GptLlmAdapter,
            llm_model_selector_service_1.LlmModelSelectorService,
            {
                provide: ai_tokens_1.LLM_SERVICE_ADAPTERS,
                useFactory: (gptAdapter) => [gptAdapter],
                inject: [gpt_llm_adapter_1.GptLlmAdapter],
            },
        ],
        exports: [llm_model_selector_service_1.LlmModelSelectorService],
    })
], AiModule);
//# sourceMappingURL=ai.module.js.map