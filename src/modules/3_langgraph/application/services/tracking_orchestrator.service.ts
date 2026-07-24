import { Inject, Injectable } from '@nestjs/common';
import type { RetrievedContext } from '../../../../shared/types/semantic-pipeline.type';
import { type TrackingLangChainPort, SEMANTIC_TRACKING_ADAPTER } from '../ports/semantic_track.port';

@Injectable()
export class TrackingOrchestratorService {
    constructor(
        @Inject(SEMANTIC_TRACKING_ADAPTER) private readonly graphAdapter: TrackingLangChainPort,
    ) { }

    plan(question: string): Promise<string[]> {
        return this.graphAdapter.plan(question);
    }

    synthesize(question: string, contexts: RetrievedContext[]): Promise<string> {
        return this.graphAdapter.synthesize(question, contexts);
    }
}
