export type PolicyDecision = 'allow' | 'deny' | 'review';
export interface PolicyCheckResult {
    decision: PolicyDecision;
    reasons: string[];
}
