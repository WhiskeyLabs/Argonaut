export type IdentityGenerationErrorCode = 'INVALID_IDENTITY_INPUT' | 'MISSING_REQUIRED_FIELD';

export class IdentityGenerationError extends Error {
    readonly code: IdentityGenerationErrorCode;

    constructor(code: IdentityGenerationErrorCode, message: string) {
        super(message);
        this.name = 'IdentityGenerationError';
        this.code = code;
    }
}
