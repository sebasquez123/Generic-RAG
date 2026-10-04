-- Initialize pgvector. The RAG schema (rag_source_documents, rag_document_chunks,
-- HNSW index) is created by the API on startup from
-- src/modules/database/vector/schema.ts, sized with RAG_EMBEDDING_DIMENSIONS.
CREATE EXTENSION IF NOT EXISTS vector;
