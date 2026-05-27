import type { StandardLlmRequest, StandardLlmResponse } from '../../domain/types/llm-provider.type';
import type { LlmServicePort } from '../ports/llm-service.port';
export declare class LlmModelSelectorService {
    private readonly adapters;
    constructor(adapters: LlmServicePort[]);
    infer(request: StandardLlmRequest): Promise<StandardLlmResponse[]>;
    private selectAdapter;
}
