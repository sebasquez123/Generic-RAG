
enum DomainErrorCodes {
    NO_CREDENTIALS_OR_MODEL_NOT_FOUND = 'NO_CREDENTIALS_OR_MODEL_NOT_FOUND',
    PRECONDITION_FAILED = 'PRECONDITION_FAILED',
    TEXT_NO_FORMATTED = 'TEXT_NO_FORMATTED',
}

export class OpenAiPreconditionError extends Error {
    public readonly code: string;
    public readonly dependency: string;
    constructor(
        message: string,
        dependency?: string,
        public readonly comingTrace?: unknown
    ) {
        super(message);
        this.code = DomainErrorCodes.PRECONDITION_FAILED;
        this.dependency = dependency ?? 'openai-llm.module';
    }
}

export class OpenAiNoFoundError extends Error {
    public readonly code: string;
    public readonly dependency: string;
    constructor(
        message: string,
        dependency?: string,
        public readonly comingTrace?: unknown
    ) {
        super(message);
        this.code = DomainErrorCodes.NO_CREDENTIALS_OR_MODEL_NOT_FOUND;
        this.dependency = dependency ?? 'openai-llm.module';
    }
}

export class OpenAiGatewayError extends Error {
    public readonly code: string;
    public readonly dependency: string;

    constructor(
        message: string,
        dependency?: string,
        public readonly comingTrace?: unknown
    ) {
        super(message);
        this.code = DomainErrorCodes.TEXT_NO_FORMATTED;
        this.dependency = dependency ?? 'openai-llm.module';
    }
}
