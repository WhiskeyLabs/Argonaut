export type ReachabilityComputeErrorCode = 'INVALID_INPUT';

export class ReachabilityComputeError extends Error {
    readonly code: ReachabilityComputeErrorCode;

    constructor(code: ReachabilityComputeErrorCode, message: string) {
        super(message);
        this.name = 'ReachabilityComputeError';
        this.code = code;
    }
}
