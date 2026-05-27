import type { PolicyCheckResult } from '../../domain/types/policy-decision.type';
export declare class RequestModerationService {
    inspectInput(input: string): PolicyCheckResult;
}
