import { Injectable } from '@nestjs/common';
import type { SemanticGraphPort } from '../../application/ports/semantic-graph.port';
import type { RetrievedContext } from '../../../../shared/types/semantic-pipeline.type';

@Injectable()
export class LangchainSemanticGraphAdapter implements SemanticGraphPort {
  plan(question: string): Promise<string[]> {
    // MVP graph target: orchestrate ingestion for only two source families:
    // PDF documents and custom-shaped structured data.
    // Next nodes: detect source kind -> parse/normalize -> format chunks ->
    // embed chunks -> store chunks in pgvector -> emit ingestion receipt.
    return Promise.resolve([
      `receive-question:${question}`,
      'route-source:pdf-or-structured-data',
      'format-content:formatter-module',
      'embed-content:embedding-module',
      'store-content:storage-module',
    ]);
  }

  synthesize(question: string, contexts: RetrievedContext[]): Promise<string> {
    return Promise.resolve(
      [
        `Semantic context summary for: ${question}`,
        `Retrieved contexts: ${contexts.length}.`,
      ].join(' '),
    );
  }
}
