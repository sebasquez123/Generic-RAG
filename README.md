# RAG Multiagent API

NestJS API for a sustainable autonomous RAG system. The project is intentionally modular: RAG composes specialized modules instead of owning every adapter internally.

The target system is JWT-protected, microservice-friendly, connected to Postgres + pgvector for vector memory, moderated for request safety and policy abuse, able to ingest files starting with PDFs, and orchestrated internally with LangGraph and LangChain.

## Current Endpoint Behavior

Default prefix: `api/v1`

- `GET /api/v1/rag/lineup` returns the initialized module composition: active GPT adapter, planned Gemini/Claude/DeepSeek adapters, vector memory, LangGraph/LangChain orchestration, PDF-first ingestion, and moderation.
- `POST /api/v1/rag/ask` validates input with Zod, normalizes the query, retrieves context from the vector-memory module, selects an LLM through the AI module, and asks the LangGraph module to synthesize the response.

Example body:

```json
{
  "question": "How should agents ground an answer?",
  "contextLimit": 5
}
```

## Module Map

```text
src/
  modules/
    RAG/
      presentation/        Controller, DTO, Zod validation
      application/         RAG use case that composes capability modules
      domain/              RAG query entity, policies, answer type
    ai/
      domain/              Standard LLM request/response types
      application/         Hexagonal ports and model selector service
      adapters/            Provider adapters; GPT is initialized first
    langgraph/
      domain/              RAG graph state types
      application/         Graph orchestration port and service
      adapters/            LangChain/LangGraph adapter placeholder
    vector-memory/
      application/         Vector retrieval port and service
      adapters/            Postgres/pgvector retrieval adapter
    database/
      vector/              Direct Postgres connection for pgvector operations
    ingestion/
      domain/              Ingested document types
      application/         File ingestion use case placeholder
      adapters/pdf/        PDF ingestion adapter placeholder
    moderation/
      domain/              Policy decision types
      application/         Request/context safety service placeholder
    shared/
      types/               Cross-module RAG data contracts
  middleware/
    auth/                  JWT decorator and guard skeleton
    user-context/          User lookup middleware and global storage skeleton
    policy/                Request abuse/policy decorator and guard skeleton
```

## Architectural Direction

- `RAG` is the API-facing composition module.
- `ai` is explicitly hexagonal. Every LLM adapter must implement one standardized `LlmServicePort`.
- `langgraph` owns internal RAG graph orchestration. LangGraph and LangChain are installed and reserved for graph/state/runnable implementation.
- `vector-memory` owns retrieval from Postgres + pgvector.
- `database` owns connection concerns only.
- `ingestion` owns document parsing/chunking/embedding flow, starting with PDFs.
- `moderation` owns context safety, request abuse detection, and policy decisions.

## Installed Core Packages

- NestJS
- `pg` for direct Postgres/pgvector access
- Zod for request validation
- `@langchain/core`
- `@langchain/langgraph`

## Environment

```bash
RAG_VECTOR_DATABASE_URL="postgresql://user:password@localhost:5432/rag_api"
```

`RAG_VECTOR_DATABASE_URL` is used by the vector-memory module for pgvector-oriented queries.

## Running

```bash
npm install
npm run start:dev
```

## Testing

```bash
npm run lint
npm run build
npm test
npm run test:e2e
```

## Next Implementation Steps

- Replace the GPT stub with the official provider SDK adapter.
- Add Gemini, Claude, and DeepSeek adapters behind the same LLM port.
- Implement LangGraph `StateGraph` nodes for policy check, retrieval, model selection, synthesis, citation validation, and final moderation.
- Add pgvector schema/migrations for document chunks and embeddings.
- Implement PDF extraction, chunking, embedding, and persistence in `ingestion`.
- Keep JWT verification local to the API edge or service boundary, then pass user context through trusted request metadata.
