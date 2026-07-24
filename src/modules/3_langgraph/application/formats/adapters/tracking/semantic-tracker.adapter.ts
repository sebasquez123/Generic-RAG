import { Injectable } from '@nestjs/common';
import type { TrackingLangChainPort } from '../../../ports/semantic_track.port';
import type { RetrievedContext } from '../../../../../../shared/types/semantic-pipeline.type';

@Injectable()
export class SemanticTrackerAdapter implements TrackingLangChainPort {
    plan(question: string): Promise<string[]> {
        throw new Error('Method not implemented.');
    }
    synthesize(question: string, contexts: RetrievedContext[]): Promise<string> {
        throw new Error('Method not implemented.');
    }
}