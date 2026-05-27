export interface RequestUserContext {
    userId?: string;
}
export declare class GlobalStorage {
    private static userContext;
    static setUserContext(context: RequestUserContext): void;
    static getUserContext(): RequestUserContext;
}
