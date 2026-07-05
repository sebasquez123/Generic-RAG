export class IngestStructuredDto {
  source!: string;
  data!: string | Record<string, unknown> | Array<unknown>;
}