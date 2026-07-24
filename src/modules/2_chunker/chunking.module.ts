import { Module } from '@nestjs/common';
import { LlmsModule } from "~/modules/5_LLM's/llms.module";
import { ChunkingService } from './application/chunking.service';
import { LanggraphModule } from '~/modules/3_langgraph/langgraph.module';

@Module({
  imports: [LlmsModule, LanggraphModule],
  providers: [ChunkingService],
  exports: [ChunkingService],
})
export class ChunkingModule { }
