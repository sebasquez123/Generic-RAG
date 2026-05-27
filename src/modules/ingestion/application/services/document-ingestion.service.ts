import { Injectable } from '@nestjs/common';

@Injectable()
export class DocumentIngestionService {
  // Next step: route files by MIME type, starting with PDFs.
  // PDF flow: extract text -> chunk -> enrich metadata -> embed -> persist
  // chunks and embeddings into pgvector.
}
