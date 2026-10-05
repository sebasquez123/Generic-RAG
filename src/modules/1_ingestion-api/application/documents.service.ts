import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { RagConfig } from '~/config';
import { StorageService } from '~/modules/7_storage/application/services/storage.service';
import { RAG_CONFIG } from '~/shared/config/rag-config.module';
import {
  canAccessNamespace,
  resolveNamespace,
  type NamespaceAccess,
} from '~/shared/auth/principal';
import { LoggerService } from '~/shared/logging/main.logger';
import {
  IngestionStatus,
  type DocumentRecord,
  type DocumentType,
} from '~/shared/types/semantic-pipeline.type';
import {
  DocumentBusyError,
  DocumentNotFoundError,
  InvalidDocumentError,
} from '../domain/errors/domain_errors';
import {
  assertContentMatchesType,
  detectDocumentType,
} from '../domain/services/document-type.policy';
import type { IngestionFileInput } from './ports/ingestion-format.port';

export interface RegisterDocumentInput {
  file: IngestionFileInput;
  namespace?: string;
  /** Namespaces granted to the caller's API key. */
  access: NamespaceAccess;
  source?: string;
  documentType?: DocumentType;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

/** Document registry use cases: upload, lookup, listing and deletion. */
@Injectable()
export class DocumentsService {
  private readonly logger = new LoggerService(DocumentsService.name);

  constructor(
    private readonly storage: StorageService,
    @Inject(RAG_CONFIG) private readonly config: RagConfig,
  ) {}

  async register(input: RegisterDocumentInput) {
    const { file } = input;
    if (file.buffer.length > this.config.maxFileBytes)
      throw new InvalidDocumentError(
        `File exceeds the ${this.config.maxFileBytes} bytes limit`,
      );

    const documentType = detectDocumentType(
      file.fileName,
      file.mimeType,
      input.documentType,
    );
    assertContentMatchesType(file.buffer, documentType);

    const namespace = resolveNamespace(
      input.access,
      input.namespace,
      this.config.defaultNamespace,
    );
    const contentHash = createHash('sha256').update(file.buffer).digest('hex');
    const result = await this.storage.createDocument({
      id: randomUUID(),
      namespace,
      name: file.fileName,
      documentType,
      source: input.source?.trim() || file.fileName,
      mimeType: file.mimeType,
      sizeBytes: file.buffer.length,
      contentHash,
      fileContent: file.buffer,
      metadata: input.metadata ?? {},
      tags: [...new Set(input.tags ?? [])],
    });

    this.logger.event(
      result.created ? 'Document received' : 'Duplicate document upload',
      {
        documentId: result.document.id,
        namespace,
        documentType,
        sizeBytes: file.buffer.length,
        contentHash,
      },
    );
    return result;
  }

  /**
   * A document outside the caller's namespaces is reported as missing, so ids
   * cannot be used to probe other tenants.
   */
  async get(id: string, access: NamespaceAccess): Promise<DocumentRecord> {
    const document = await this.storage.findDocument(id);
    if (!document || !canAccessNamespace(access, document.namespace))
      throw new DocumentNotFoundError(id);
    return document;
  }

  list(
    query: {
      namespace?: string;
      status?: IngestionStatus;
      limit: number;
      offset: number;
    },
    access: NamespaceAccess,
  ) {
    if (query.namespace && !canAccessNamespace(access, query.namespace))
      return Promise.resolve({ items: [], total: 0 });
    return this.storage.listDocuments({
      ...query,
      namespaces: access === '*' ? undefined : [...access],
    });
  }

  async listChunks(
    id: string,
    access: NamespaceAccess,
    limit: number,
    offset: number,
  ) {
    await this.get(id, access);
    return this.storage.listChunks(id, limit, offset);
  }

  async delete(id: string, access: NamespaceAccess): Promise<void> {
    const document = await this.get(id, access);
    if (
      document.status === IngestionStatus.Processing &&
      !this.isStale(document)
    )
      throw new DocumentBusyError(
        `Document ${id} is being processed; retry when it finishes`,
      );

    await this.storage.deleteDocument(id);
    this.logger.event('Document deleted', {
      documentId: id,
      namespace: document.namespace,
    });
  }

  /** A PROCESSING document whose lease expired belongs to a dead worker. */
  isStale(document: DocumentRecord): boolean {
    return !document.leaseUntil || document.leaseUntil.getTime() < Date.now();
  }
}
