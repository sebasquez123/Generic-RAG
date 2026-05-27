export class SemanticQuery {
  constructor(
    public readonly question: string,
    public readonly contextLimit: number,
  ) {}
}
