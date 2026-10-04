import { randomUUID } from 'node:crypto';
import type {
  DocumentRegistryRepository,
  DocumentStorageRepository,
} from '~/modules/7_storage/application/ports/document-storage.repository';
import {
  IngestionStatus,
  type DocumentListQuery,
  type DocumentRecord,
  type EmbeddedChunk,
  type IngestionCompletion,
  type IngestionError,
  type IngestionProgress,
  type IngestionStage,
  type NewDocument,
  type RetrievedContext,
  type StoredChunk,
  type VectorSearchQuery,
} from '~/shared/types/semantic-pipeline.type';

interface StoredVectorChunk extends StoredChunk {
  namespace: string;
  contentHash: string;
  embedding: number[];
}

const cosine = (left: number[], right: number[]) => {
  let dot = 0;
  let a = 0;
  let b = 0;
  left.forEach((value, index) => {
    dot += value * right[index];
    a += value * value;
    b += right[index] * right[index];
  });
  return dot / (Math.sqrt(a) * Math.sqrt(b) || 1);
};

/** Behavioural twin of the pgvector repository, used by pipeline tests. */
export class InMemoryStorage
  implements DocumentRegistryRepository, DocumentStorageRepository
{
  readonly documents = new Map<string, DocumentRecord & { file: Buffer }>();
  readonly chunks: StoredVectorChunk[] = [];
  failNextCommit?: Error;

  private clone(document: DocumentRecord & { file: Buffer }): DocumentRecord {
    const { file: _file, ...record } = document;
    return structuredClone(record);
  }

  create(document: NewDocument) {
    const existing = [...this.documents.values()].find(
      (candidate) =>
        candidate.namespace === document.namespace &&
        candidate.contentHash === document.contentHash,
    );
    if (existing)
      return Promise.resolve({
        document: this.clone(existing),
        created: false,
      });

    const now = new Date();
    const record = {
      id: document.id,
      namespace: document.namespace,
      name: document.name,
      documentType: document.documentType,
      source: document.source,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      contentHash: document.contentHash,
      metadata: document.metadata,
      tags: document.tags,
      status: IngestionStatus.Pending,
      progress: {},
      chunkCount: 0,
      parserInfo: {},
      createdAt: now,
      updatedAt: now,
      file: document.fileContent,
    };
    this.documents.set(document.id, record);
    return Promise.resolve({ document: this.clone(record), created: true });
  }

  findById(id: string) {
    const document = this.documents.get(id);
    return Promise.resolve(document ? this.clone(document) : undefined);
  }

  getFileContent(id: string) {
    return Promise.resolve(this.documents.get(id)?.file);
  }

  list(query: DocumentListQuery) {
    const items = [...this.documents.values()]
      .filter(
        (document) =>
          !query.namespace || document.namespace === query.namespace,
      )
      .filter((document) => !query.status || document.status === query.status);
    return Promise.resolve({
      items: items
        .slice(query.offset, query.offset + query.limit)
        .map((item) => this.clone(item)),
      total: items.length,
    });
  }

  delete(id: string) {
    const existed = this.documents.delete(id);
    this.removeChunks(id);
    return Promise.resolve(existed);
  }

  claimForProcessing(id: string, staleBefore: Date) {
    const document = this.documents.get(id);
    if (!document) return Promise.resolve(undefined);
    if (
      document.status === IngestionStatus.Processing &&
      document.updatedAt >= staleBefore
    )
      return Promise.resolve(undefined);
    Object.assign(document, {
      status: IngestionStatus.Processing,
      stage: undefined,
      error: undefined,
      progress: {},
      ingestionStartedAt: new Date(),
      updatedAt: new Date(),
    });
    return Promise.resolve(this.clone(document));
  }

  updateProgress(
    id: string,
    stage: IngestionStage,
    progress: IngestionProgress,
  ) {
    const document = this.documents.get(id);
    if (document?.status === IngestionStatus.Processing)
      Object.assign(document, {
        stage,
        progress: structuredClone(progress),
        updatedAt: new Date(),
      });
    return Promise.resolve();
  }

  markFailed(id: string, error: IngestionError, progress: IngestionProgress) {
    const document = this.documents.get(id);
    if (document)
      Object.assign(document, {
        status: IngestionStatus.Failed,
        stage: error.stage,
        error,
        progress: structuredClone(progress),
        updatedAt: new Date(),
      });
    return Promise.resolve();
  }

  commitIngestion(
    documentId: string,
    chunks: EmbeddedChunk[],
    completion: IngestionCompletion,
  ) {
    if (this.failNextCommit) {
      const error = this.failNextCommit;
      this.failNextCommit = undefined;
      return Promise.reject(error);
    }
    const document = this.documents.get(documentId);
    if (!document) return Promise.reject(new Error('deleted during ingestion'));

    this.removeChunks(documentId);
    for (const chunk of chunks)
      this.chunks.push({
        id: randomUUID(),
        documentId,
        namespace: document.namespace,
        chunkIndex: chunk.chunkIndex,
        chunkType: chunk.chunkType,
        content: chunk.content,
        contentHash: chunk.contentHash,
        pageStart: chunk.pageStart,
        pageEnd: chunk.pageEnd,
        section: chunk.section,
        sheet: chunk.sheet,
        metadata: chunk.metadata,
        embedding: chunk.embedding,
        embeddingVersion: completion.embedding.version,
        createdAt: new Date(),
      });
    Object.assign(document, {
      status: IngestionStatus.Completed,
      stage: undefined,
      error: undefined,
      chunkCount: chunks.length,
      parserInfo: completion.parserInfo,
      chunking: completion.chunking,
      embedding: completion.embedding,
      progress: completion.progress,
      ingestedAt: new Date(),
      updatedAt: new Date(),
    });
    return Promise.resolve();
  }

  searchSimilarChunks(query: VectorSearchQuery): Promise<RetrievedContext[]> {
    const { filters } = query;
    const results = this.chunks
      .filter(
        (chunk) =>
          chunk.namespace === query.namespace &&
          chunk.embeddingVersion === query.embeddingVersion,
      )
      .map((chunk) => ({
        chunk,
        document: this.documents.get(chunk.documentId)!,
      }))
      .filter(
        ({ chunk, document }) =>
          (!filters.documentIds?.length ||
            filters.documentIds.includes(chunk.documentId)) &&
          (!filters.documentTypes?.length ||
            filters.documentTypes.includes(document.documentType)) &&
          (!filters.sources?.length ||
            filters.sources.includes(document.source)) &&
          (!filters.tags?.length ||
            filters.tags.some((tag) => document.tags.includes(tag))) &&
          (!filters.sheets?.length ||
            (chunk.sheet !== undefined &&
              filters.sheets.includes(chunk.sheet))) &&
          (!filters.metadata ||
            Object.entries(filters.metadata).every(
              ([key, value]) => document.metadata[key] === value,
            )),
      )
      .map(({ chunk, document }) => ({
        chunkId: chunk.id,
        documentId: chunk.documentId,
        documentName: document.name,
        documentType: document.documentType,
        source: document.source,
        tags: document.tags,
        documentMetadata: document.metadata,
        chunkIndex: chunk.chunkIndex,
        chunkType: chunk.chunkType,
        content: chunk.content,
        contentHash: chunk.contentHash,
        pageStart: chunk.pageStart,
        pageEnd: chunk.pageEnd,
        section: chunk.section,
        sheet: chunk.sheet,
        chunkMetadata: chunk.metadata,
        createdAt: chunk.createdAt,
        score: cosine(query.embedding, chunk.embedding),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, query.limit);
    return Promise.resolve(results);
  }

  listChunks(documentId: string, limit: number, offset: number) {
    const items = this.chunks
      .filter((chunk) => chunk.documentId === documentId)
      .sort((left, right) => left.chunkIndex - right.chunkIndex);
    return Promise.resolve({
      items: items
        .slice(offset, offset + limit)
        .map(
          ({ embedding: _e, namespace: _n, contentHash: _h, ...chunk }) =>
            chunk,
        ),
      total: items.length,
    });
  }

  private removeChunks(documentId: string) {
    for (let index = this.chunks.length - 1; index >= 0; index -= 1)
      if (this.chunks[index].documentId === documentId)
        this.chunks.splice(index, 1);
  }
}
