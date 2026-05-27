import type { LlmServicePort } from '../../application/ports/llm-service.port';
import type { StandardLlmRequest, StandardLlmResponse } from '../../domain/types/llm-provider.type';
export declare class GptLlmAdapter implements LlmServicePort {
    readonly provider = "gpt";
    infer(request: StandardLlmRequest): Promise<StandardLlmResponse>;
}
