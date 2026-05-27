import { PgVectorConnectionService } from '../../../database/vector/pg-vector-connection.service';
import type { RetrievedContext } from '../../../shared/types/rag-shared.type';
import type { VectorContextRepository } from '../../application/ports/vector-context.repository';
export declare class PgVectorContextRepository implements VectorContextRepository {
    private readonly vectorConnection;
    constructor(vectorConnection: PgVectorConnectionService);
    retrieve(question: string, limit: number): Promise<RetrievedContext[]>;
    private stubContexts;
}
