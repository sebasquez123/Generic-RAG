# Generic RAG MVP

NestJS API for the ingestion and retrieval foundation of a RAG system.

This project is not a chat API. The first stage is only about preparing knowledge for later retrieval: ingest PDFs and custom-shaped structured data, format them into stable chunks, transform those chunks into embeddings, and store them in Postgres + pgvector.

LangGraph is the intended orchestration layer for this MVP ingestion workflow. The graph should coordinate the path:

```text
source input -> formatting -> embedding -> pgvector storage -> ingestion receipt
```

Prisma, relational Postgres modules, selectable answer-generation engines, and chat flows are intentionally out of scope.

## Current Endpoints

Default prefix: `api/v1`

- `GET /api/v1/ingestion/lineup`
  Returns the initialized ingestion composition.
- `POST /api/v1/ingestion/text`
  Validates text input with Zod, chunks it, embeds it, and stores it through the pgvector storage module when configured.
- `GET /api/v1/query/lineup`
  Returns the current retrieval/query composition.
- `POST /api/v1/query/fetch`
  Validates a retrieval query with Zod and returns retrieved, scored contexts.

Current text ingestion example:

```json
{
  "source": "notes/day-1.md",
  "content": "A document or structured-data projection ready for chunking."
}
```

Current retrieval example:

```json
{
  "question": "What does the stored content say about ingestion?",
  "contextLimit": 5
}
```

## Getting Started

### Prerequisites
- Docker & Docker Compose
- Node.js 18+
- npm

### Environment Setup

1. **Copy environment file**:
```bash
cp .env.example .env
```

2. **Edit `.env`** with your configuration:
```bash
DB_PASSWORD=your_secure_password_here
OPENAI_API_KEY=sk-your-key
GEMINI_API_KEY=your-key
```

### Running with Docker

**Start all services** (PostgreSQL + pgvector + API):
```bash
docker-compose up -d
```

**View logs**:
```bash
docker-compose logs -f api        # API logs
docker-compose logs -f db         # Database logs
docker-compose logs -f            # All logs
```

**Stop all services**:
```bash
docker-compose down
```

**Stop and remove volumes** (clean database):
```bash
docker-compose down -v
```

### Development Server

**Without Docker** (requires local PostgreSQL + pgvector):
```bash
npm run dev
```

**API runs at**: `http://localhost:3030`

### Database Connection

- **Host**: `localhost:9532` (or `db:5432` inside Docker)
- **User**: `phit_user`
- **Database**: `phit-local`
- **Password**: Value from `.env` `DB_PASSWORD`

## MVP Scope

The first useful version should do only this:

- Accept PDF input.
- Accept structured data with caller-defined shape.
- Normalize PDFs and structured records into one shared formatted chunk contract.
- Preserve metadata such as PDF page numbers and structured field paths.
- Generate embeddings through one internal embedding module.
- Store embedded chunks in pgvector.
- Use LangGraph to orchestrate the ingestion flow once the node contracts are ready.

Anything outside that path should wait unless it directly improves ingestion quality, storage correctness, or retrieval confidence.

## Module Map

```text
src/
  modules/
    ingestion-api/
      presentation/        Controllers, DTOs, and Zod validation for ingestion
      application/         PDF/text/structured-data ingestion use cases
      domain/              Ingested document contracts
      adapters/pdf/        PDF parsing adapter boundary

    formatter/
      application/         Converts PDFs and structured data into chunk contracts

    embedding/
      application/         Single internal text-to-vector embedding service
      domain/              Embedding vector types

    storage/
      application/         Storage ports and storage service
      adapters/postgres/   pgvector document repository

    database/
      vector/              Direct Postgres connection for pgvector operations

    langgraph/
      domain/              Semantic graph state types
      application/         Graph orchestration port and service
      adapters/langchain/  LangGraph/LangChain adapter boundary

    query-api/
      presentation/        Controllers, DTOs, and Zod validation for retrieval
      application/         Query normalization and context fetching use case
      domain/              Semantic query entity and query policy

    retrieval/
      application/         Retrieval service over storage

    scoring/
      application/         Context scoring and ranking services

  shared/
    types/                 Cross-module semantic pipeline contracts
    middleware/            Request context and guard skeletons
```

## Architectural Direction

- `ingestion-api` is the API-facing module for knowledge ingestion.
- `formatter` owns conversion from raw input into stable chunk contracts.
- `embedding` is deliberately small: it turns text into vectors and exposes no controller.
- `storage` owns pgvector persistence through ports and adapters.
- `database/vector` owns connection concerns only.
- `langgraph` will orchestrate the ingestion workflow, not chat generation.
- `query-api`, `retrieval`, and `scoring` support retrieval checks over stored content.

The project should keep clean architecture boundaries:

- Controllers validate and delegate.
- Application services coordinate use cases.
- Domain files describe stable contracts and policies.
- Adapters isolate external concerns such as PDF parsing, LangGraph, and pgvector.

## Out Of Scope

- Chat completions.
- Multi-provider answer generation.
- Prisma.
- Relational database modules.
- User/account CRUD.
- Large roadmap changes that do not advance PDF or structured-data ingestion.

## Scheduled Agent Reports

Automated Codex scheduled jobs are governed by `AGENT.md`.

Only three scheduled report agents are expected:

- Code Journey Consultant: writes dated next-step guidance in `aadr/consultant`.
- Safety Watcher: writes dated security and performance review notes in `aadr/watcher`.
- Good Practice And Consistency Supervisor: writes dated culture and consistency notes in `aadr/supervisor`.

Each agent must check the latest previous report in its own folder. If that report is not `Status: GREEN`, the agent must stop and write only a blocked report for the current date.

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

`RAG_VECTOR_DATABASE_URL` is used only by the storage/database vector path for pgvector-oriented queries and writes.

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

- Define the shared formatted chunk contract for PDF pages and structured-data field paths.
- Add `POST /api/v1/ingestion/pdf`.
- Add `POST /api/v1/ingestion/structured`.
- Implement PDF extraction inside `src/modules/ingestion-api/adapters/pdf`.
- Add formatter methods for PDF blocks and structured records.
- Replace the placeholder embedding logic with the single project-standard embedding provider.
- Add pgvector schema guidance for `rag_documents(source, content, embedding, metadata)`.
- Build the LangGraph `StateGraph` for route source -> format -> embed -> store -> receipt.
