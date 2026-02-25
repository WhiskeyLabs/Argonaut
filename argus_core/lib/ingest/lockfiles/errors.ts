export type LockfileParseErrorCode = 'INVALID_JSON';

export class LockfileParseError extends Error {
    readonly code: LockfileParseErrorCode;

    constructor(code: LockfileParseErrorCode, message: string) {
        super(message);
        this.name = 'LockfileParseError';
        this.code = code;
    }
}
