import { Injectable } from '@nestjs/common';
import type { PolicyDecision } from '../../domain/types/policy-decision.type';

@Injectable()
export class RequestModerationService {
  evaluate(): PolicyDecision {
    return {
      allowed: true,
      reasons: [],
    };
  }
}
