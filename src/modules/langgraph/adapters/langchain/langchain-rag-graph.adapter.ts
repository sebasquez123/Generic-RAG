import { Injectable } from '@nestjs/common';
import type { RagGraphPort } from '../../application/ports/rag-graph.port';
import type {
  ModelInference,
  RetrievedContext,
} from '../../../RAG/types/rag-shared.type';

@Injectable()
export class LangchainRagGraphAdapter implements RagGraphPort {
  plan(question: string): Promise<string[]> {
    // Next step: build a LangGraph StateGraph here.
    // Suggested nodes: input policy check, retrieval planning, vector search,
    // model selection, answer synthesis, citation validation, final moderation.
    return Promise.resolve([
      `receive-question:${question}`,
      'policy-check:moderation-module',
      'retrieve-context:vector-memory-module',
      'select-model:ai-module',
      'synthesize:langgraph-langchain',
    ]);
  }

  synthesize(
    question: string,
    contexts: RetrievedContext[],
    inferences: ModelInference[],
  ): Promise<string> {
    const bestInference = inferences.reduce<ModelInference | undefined>(
      (best, current) =>
        !best || current.confidence > best.confidence ? current : best,
      undefined,
    );

    // Next step: replace this deterministic placeholder with a LangChain Runnable
    // invoked inside the LangGraph final synthesis node.
    return Promise.resolve(
      [
        `RAG synthesis for: ${question}`,
        `Selected model signal: ${bestInference?.provider ?? 'none'}.`,
        `Retrieved contexts: ${contexts.length}.`,
      ].join(' '),
    );
  }
}
