import { Inject, Injectable } from '@nestjs/common';
import type { RetrievedContext } from '../../../RAG/types/rag-shared.type';
import type { VectorContextRepository } from '../ports/vector-context.repository';
import { VECTOR_CONTEXT_REPOSITORY } from '../ports/vector-memory.tokens';

@Injectable()
export class VectorMemoryService {
  constructor(
    @Inject(VECTOR_CONTEXT_REPOSITORY)
    private readonly repository: VectorContextRepository,
  ) {}

  retrieve(question: string, limit: number): Promise<RetrievedContext[]> {
    return this.repository.retrieve(question, limit);
  }
}
