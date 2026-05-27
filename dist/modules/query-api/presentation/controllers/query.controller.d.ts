import { QueryService } from '../../application/services/query.service';
import type { FetchQueryDto } from '../dto/fetch-query.dto';
export declare class QueryController {
    private readonly queryService;
    constructor(queryService: QueryService);
    getLineup(): {
        purpose: string;
        retrievalModule: string;
        scoringModule: string;
        storageModule: string;
    };
    fetch(body: FetchQueryDto): Promise<import("../../../../shared/types/semantic-pipeline.type").RetrievedContext[]>;
}
