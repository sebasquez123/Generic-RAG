# Semantic Ingestion API

NestJS API for a sustainable semantic ingestion and retrieval system. The project is intentionally modular: the API-facing ingestion module composes focused clean-architecture modules instead of owning every adapter internally.

The target system is JWT-protected, microservice-friendly, connected to Postgres + pgvector for semantic storage, moderated for request safety and policy abuse, able to ingest files starting with PDFs, and orchestrated internally with LangGraph and LangChain.

## Current Endpoint Behavior

Default prefix: `api/v1`

- `GET /api/v1/ingestion/lineup` returns the initialized ingestion composition: ingestion, embedding, and pgvector storage.
- `POST /api/v1/ingestion/text` validates input with Zod, chunks text, transforms chunks into embeddings, and persists them through the pgvector storage module when configured.
- `GET /api/v1/query/lineup` returns the data-fetching module composition.
- `POST /api/v1/query/fetch` validates input with Zod and returns retrieved, scored contexts.

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
    embedding/
      application/         Text-to-vector embedding service
      domain/              Embedding vector types
    query/
      presentation/        Controller, DTO, Zod validation for data fetching
      application/         Query normalization and context fetching use case
      domain/              Semantic query entity and query policy
    retrieval/
      application/         Retrieval service over storage
    scoring/
      application/         Context scoring services
    formatter/
      application/         Response formatting services
    storage/
      application/         Storage ports and storage service
      adapters/            Postgres/pgvector storage repository
    langgraph/
      domain/              Semantic graph state types
      application/         Graph orchestration port and service
      adapters/            LangChain/LangGraph adapter placeholder
    database/
      vector/              Direct Postgres connection for pgvector operations
    ingestion/
      domain/              Ingested document types
      application/         Text/PDF ingestion use cases
      presentation/        Controller, DTO, Zod validation
      adapters/pdf/        PDF ingestion adapter placeholder
    moderation/
      domain/              Policy decision types
      application/         Request/context safety service placeholder
    shared/
      types/               Cross-module semantic pipeline contracts
  middleware/
    auth/                  JWT decorator and guard skeleton
    user-context/          User lookup middleware and global storage skeleton
    policy/                Request abuse/policy decorator and guard skeleton
```

## Architectural Direction

- `ingestion` is the API-facing composition module.
- `embedding` is a small internal text-to-vector capability. It does not expose controllers or select between provider engines.
- `query` owns presentation-level data fetching and normalized query flow.
- `retrieval` owns context retrieval behavior.
- `scoring` owns context ranking decisions.
- `formatter` owns output shaping.
- `storage` owns storage ports and pgvector-backed document access.
- `langgraph` owns internal semantic graph orchestration. LangGraph and LangChain are installed and reserved for graph/state/runnable implementation.
- `database` owns connection concerns only.
- `ingestion` owns document parsing/chunking/embedding flow, starting with text and PDFs.
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

`RAG_VECTOR_DATABASE_URL` is used by the storage module for pgvector-oriented queries.

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

- Implement LangGraph `StateGraph` nodes for policy check, retrieval planning, context formatting, citation validation, and final moderation.
- Add pgvector schema/migrations for document chunks and embeddings.
- Implement PDF extraction, chunking, embedding, and persistence in `ingestion`.
- Keep JWT verification local to the API edge or service boundary, then pass user context through trusted request metadata.
