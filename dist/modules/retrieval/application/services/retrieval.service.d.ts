import { StorageService } from '../../../storage/application/services/storage.service';
import type { RetrievedContext } from '../../../../shared/types/semantic-pipeline.type';
export declare class RetrievalService {
    private readonly storage;
    constructor(storage: StorageService);
    retrieve(question: string, limit: number): Promise<RetrievedContext[]>;
}
