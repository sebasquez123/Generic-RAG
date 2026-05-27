import { Module } from '@nestjs/common';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { ScoringModule } from '../scoring/scoring.module';
import { QueryService } from './application/services/query.service';
import { QueryController } from './presentation/controllers/query.controller';

@Module({
  imports: [RetrievalModule, ScoringModule],
  controllers: [QueryController],
  providers: [QueryService],
  exports: [QueryService],
})
export class QueryModule {}
