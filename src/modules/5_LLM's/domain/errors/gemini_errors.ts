
enum DomainErrorCodes {
    NO_CREDENTIALS_OR_MODEL_NOT_FOUND = 'NO_CREDENTIALS_OR_MODEL_NOT_FOUND',
    PRECONDITION_FAILED = 'PRECONDITION_FAILED',
    TEXT_NO_FORMATTED = 'TEXT_NO_FORMATTED',
}

export class GeminiPreconditionError extends Error {
    public readonly code: string;
    public readonly dependency: string;
    constructor(
        message: string,
        dependency?: string,
        public readonly comingTrace?: unknown
    ) {
        super(message);
        this.code = DomainErrorCodes.PRECONDITION_FAILED;
        this.dependency = dependency ?? 'gemini-llm.module';
    }
}

export class GeminiNoFoundError extends Error {
    public readonly code: string;
    public readonly dependency: string;
    constructor(
        message: string,
        dependency?: string,
        public readonly comingTrace?: unknown
    ) {
        super(message);
        this.code = DomainErrorCodes.NO_CREDENTIALS_OR_MODEL_NOT_FOUND;
        this.dependency = dependency ?? 'gemini-llm.module';
    }
}

export class GeminiGatewayError extends Error {
    public readonly code: string;
    public readonly dependency: string;

    constructor(
        message: string,
        dependency?: string,
        public readonly comingTrace?: unknown
    ) {
        super(message);
        this.code = DomainErrorCodes.TEXT_NO_FORMATTED;
        this.dependency = dependency ?? 'gemini-llm.module';
    }
}
