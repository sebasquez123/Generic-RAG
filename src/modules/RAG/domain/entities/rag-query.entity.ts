export class RagQuery {
  constructor(
    public readonly question: string,
    public readonly contextLimit: number,
  ) {}
}
