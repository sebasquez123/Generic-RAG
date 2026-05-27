import { Module } from '@nestjs/common';
import { FormatterService } from './application/services/formatter.service';

@Module({
  providers: [FormatterService],
  exports: [FormatterService],
})
export class FormatterModule {}
