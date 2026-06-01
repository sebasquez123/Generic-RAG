import { Injectable } from '@nestjs/common';

@Injectable()
export class TextIngestionAdapter {
  // MVP next step: extract page-aware text blocks from Texts and return a
  // neutral document shape that the formatter can chunk before embedding.
}
