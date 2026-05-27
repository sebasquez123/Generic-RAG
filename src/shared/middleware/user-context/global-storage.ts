export interface RequestUserContext {
  userId?: string;
}

export class GlobalStorage {
  private static userContext: RequestUserContext = {};

  static setUserContext(context: RequestUserContext): void {
    this.userContext = context;
  }

  static getUserContext(): RequestUserContext {
    return this.userContext;
  }
}
