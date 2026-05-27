import { Injectable } from '@nestjs/common';
import type { PolicyCheckResult } from '../../domain/types/policy-decision.type';

@Injectable()
export class RequestModerationService {
  inspectInput(input: string): PolicyCheckResult {
    // Next step: centralize abuse, context safety, and policy checks here.
    // Guards can call this service before RAG retrieval or LLM invocation.
    void input;
    return { decision: 'allow', reasons: [] };
  }
}
