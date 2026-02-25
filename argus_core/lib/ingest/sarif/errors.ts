export type SarifParseErrorCode = 'MALFORMED_JSON' | 'INVALID_INPUT';

export class SarifParseError extends Error {
    readonly code: SarifParseErrorCode;

    constructor(code: SarifParseErrorCode, message: string) {
        super(message);
        this.name = 'SarifParseError';
        this.code = code;
    }
}
