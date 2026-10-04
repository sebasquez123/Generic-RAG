import { Module } from '@nestjs/common';
import { ChunkingService } from './application/chunking.service';

// Chunking is deterministic and provider-free: it no longer depends on the LLM
// module (which only supplied a `providerName` label that did not do any chunking).
@Module({
  providers: [ChunkingService],
  exports: [ChunkingService],
})
export class ChunkingModule {}
