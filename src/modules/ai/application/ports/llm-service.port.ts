import type {
  StandardLlmRequest,
  StandardLlmResponse,
} from '../../domain/types/llm-provider.type';

export interface LlmServicePort {
  readonly provider: string;
  infer(request: StandardLlmRequest): Promise<StandardLlmResponse>;
}
