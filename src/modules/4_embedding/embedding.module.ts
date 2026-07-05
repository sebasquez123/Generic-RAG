import { Module } from '@nestjs/common';
import { LlmsModule } from "~/modules/5_LLM's/llms.module";
import { EmbeddingService } from './application/embedding.service';

@Module({
  imports: [LlmsModule],
  providers: [EmbeddingService],
  exports: [EmbeddingService],
})
export class EmbeddingModule { }
