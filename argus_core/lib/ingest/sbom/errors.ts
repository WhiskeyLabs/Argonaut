export type SbomParseErrorCode = 'INVALID_JSON';

export class SbomParseError extends Error {
    readonly code: SbomParseErrorCode;

    constructor(code: SbomParseErrorCode, message: string) {
        super(message);
        this.name = 'SbomParseError';
        this.code = code;
    }
}
