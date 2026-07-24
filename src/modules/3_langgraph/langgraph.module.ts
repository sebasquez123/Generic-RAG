import { Module } from '@nestjs/common';

import { SemanticChunkerAdapter } from './application/formats/adapters/chunking/semantic-chunker.adapter';
import { SemanticEmbedderAdapter } from './application/formats/adapters/embedding/semantic-embedder.adapter';
import { SemanticStorerAdapter } from './application/formats/adapters/storage/semantic-storer.adapter';
import { SemanticTrackerAdapter } from './application/formats/adapters/tracking/semantic-tracker.adapter';

import { SEMANTIC_CHUNKING_ADAPTER } from './application/ports/semantic_chunk.port';
import { SEMANTIC_EMBEDDING_ADAPTER } from './application/ports/semantic_embed.port';
import { SEMANTIC_STORAGE_ADAPTER } from './application/ports/semantic_storage.port';
import { SEMANTIC_TRACKING_ADAPTER } from './application/ports/semantic_track.port';

import { ChunkingOrchestratorService } from './application/services/chunking_orchestrator.service';
import { EmbeddingOrchestratorService } from './application/services/embedding_orchestrator.service';
import { StorageOrchestratorService } from './application/services/storage_orchestrator.service';
import { TrackingOrchestratorService } from './application/services/tracking_orchestrator.service';

const adapters = [
  {
    provide: SEMANTIC_CHUNKING_ADAPTER,
    useExisting: SemanticChunkerAdapter,
  },
  {
    provide: SEMANTIC_EMBEDDING_ADAPTER,
    useExisting: SemanticEmbedderAdapter,
  },
  {
    provide: SEMANTIC_STORAGE_ADAPTER,
    useExisting: SemanticStorerAdapter,
  },
  {
    provide: SEMANTIC_TRACKING_ADAPTER,
    useExisting: SemanticTrackerAdapter,
  }
];

@Module({
  providers: [
    SemanticChunkerAdapter,
    ChunkingOrchestratorService,
    SemanticEmbedderAdapter,
    EmbeddingOrchestratorService,
    SemanticStorerAdapter,
    StorageOrchestratorService,
    SemanticTrackerAdapter,
    TrackingOrchestratorService,
    ...adapters
  ],
  exports: [
    ChunkingOrchestratorService,
    EmbeddingOrchestratorService,
    StorageOrchestratorService,
    TrackingOrchestratorService,
  ],
})
export class LanggraphModule { }
