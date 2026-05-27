import { Injectable } from '@nestjs/common';
import type { RetrievedContext } from '../../../../shared/types/semantic-pipeline.type';

@Injectable()
export class ScoringService {
  scoreContexts(contexts: RetrievedContext[]): RetrievedContext[] {
    return [...contexts].sort((left, right) => right.score - left.score);
  }
}
