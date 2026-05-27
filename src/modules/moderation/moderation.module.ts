import { Module } from '@nestjs/common';
import { RequestModerationService } from './application/services/request-moderation.service';

@Module({
  providers: [RequestModerationService],
  exports: [RequestModerationService],
})
export class ModerationModule {}
