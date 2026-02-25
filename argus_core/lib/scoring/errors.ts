export type ExplanationBuildErrorCode = 'INVALID_INPUT' | 'INVALID_INPUT_RANGE';

export class ExplanationBuildError extends Error {
    readonly code: ExplanationBuildErrorCode;

    constructor(code: ExplanationBuildErrorCode, message: string) {
        super(message);
        this.name = 'ExplanationBuildError';
        this.code = code;
    }
}
