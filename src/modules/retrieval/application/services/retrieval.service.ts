import { Inject, Injectable } from '@nestjs/common';
import type { RagConfig } from '~/config';
import { EmbeddingService } from '~/modules/4_embedding/application/embedding.service';
import { StorageService } from '~/modules/7_storage/application/services/storage.service';
import { RAG_CONFIG } from '~/shared/config/rag-config.module';
import type {
  RetrievedContext,
  SearchFilters,
} from '~/shared/types/semantic-pipeline.type';

export interface CandidateQuery {
  text: string;
  namespace: string;
  filters: SearchFilters;
  topK: number;
}

/** Semantic candidate retrieval: query embedding + filtered vector search. */
@Injectable()
export class RetrievalService {
  constructor(
    private readonly storage: StorageService,
    private readonly embedding: EmbeddingService,
    @Inject(RAG_CONFIG) private readonly config: RagConfig,
  ) {}

  get embeddingVersion(): string {
    return this.embedding.descriptor.version;
  }

  /**
   * Over-fetches (topK x multiplier) so thresholding and de-duplication can
   * still fill topK with genuinely relevant chunks.
   */
  async retrieveCandidates(query: CandidateQuery): Promise<RetrievedContext[]> {
    const embedding = await this.embedding.embedQuery(query.text);
    return this.storage.searchSimilarChunks({
      embedding,
      embeddingVersion: this.embedding.descriptor.version,
      namespace: query.namespace,
      filters: query.filters,
      limit: Math.min(query.topK * this.config.search.candidateMultiplier, 200),
    });
  }
}
