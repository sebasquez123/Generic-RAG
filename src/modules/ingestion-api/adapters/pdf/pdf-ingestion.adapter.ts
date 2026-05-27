import { Injectable } from '@nestjs/common';

@Injectable()
export class PdfIngestionAdapter {
  // MVP next step: extract page-aware text blocks from PDFs and return a
  // neutral document shape that the formatter can chunk before embedding.
}
