export type InputErrorCode =
  | 'INPUT_TOO_LARGE'
  | 'INVALID_JSON'
  | 'INVALID_SARIF'
  | 'WRONG_FILE_TYPE'
  | 'LOCKFILE_PARSE_FAIL'
  | 'LOCAL_STORAGE_QUOTA'
  | 'WORKER_SCRIPT_ERROR'
  | 'UNKNOWN';

export interface StructuredInputError {
  code: InputErrorCode;
  userMessage: string;
  technicalDetail?: string;
  recoverySteps: string[];
  retryable: boolean;
}

interface GuidanceTemplate {
  title: string;
  userMessage: string;
  recoverySteps: string[];
  retryable: boolean;
}

export interface UiInputError extends StructuredInputError {
  title: string;
}

const GUIDANCE: Record<InputErrorCode, GuidanceTemplate> = {
  INPUT_TOO_LARGE: {
    title: 'File Too Large',
    userMessage: 'This file is above the 100MB ingest limit.',
    recoverySteps: [
      'Use a smaller findings file (under 100MB).',
      'If needed, split the scan output into smaller chunks and retry.',
    ],
    retryable: true,
  },
  INVALID_JSON: {
    title: 'Invalid JSON',
    userMessage: 'The uploaded file is not valid JSON.',
    recoverySteps: [
      'Verify the file is complete and not truncated.',
      'Open the file and validate JSON syntax, then retry.',
    ],
    retryable: true,
  },
  INVALID_SARIF: {
    title: 'Unsupported Findings Format',
    userMessage: 'The file is JSON, but it is not recognized as supported SARIF/findings input.',
    recoverySteps: [
      'Upload a valid SARIF 2.1.0 file or supported findings JSON.',
      'Confirm scanner export format before retrying.',
    ],
    retryable: true,
  },
  WRONG_FILE_TYPE: {
    title: 'Wrong File In This Zone',
    userMessage: 'This looks like a lockfile or unsupported file type for the scan drop zone.',
    recoverySteps: [
      'Use the main drop zone for SARIF/findings files.',
      'Use the context area for package lockfiles.',
    ],
    retryable: true,
  },
  LOCKFILE_PARSE_FAIL: {
    title: 'Lockfile Parse Failed',
    userMessage: 'The lockfile could not be parsed.',
    recoverySteps: [
      'Ensure this is a valid npm lockfile JSON.',
      'Check that lockfileVersion and dependency structure are present.',
    ],
    retryable: true,
  },
  LOCAL_STORAGE_QUOTA: {
    title: 'Local Storage Capacity Reached',
    userMessage: 'Local browser storage is full, so ingest cannot complete.',
    recoverySteps: [
      'Clear older local Argus sessions or browser site storage.',
      'Retry ingest after freeing local storage space.',
    ],
    retryable: true,
  },
  WORKER_SCRIPT_ERROR: {
    title: 'Worker Initialization Failed',
    userMessage: 'The ingest worker failed to initialize.',
    recoverySteps: [
      'Refresh the page and retry.',
      'If the issue persists, capture console details and report it.',
    ],
    retryable: true,
  },
  UNKNOWN: {
    title: 'Input Processing Failed',
    userMessage: 'Argus could not process this file.',
    recoverySteps: [
      'Retry with a known-good SARIF/findings file.',
      'If it still fails, provide the technical details to engineering.',
    ],
    retryable: true,
  },
};

function normalizeCode(code?: string): InputErrorCode {
  if (!code) return 'UNKNOWN';
  if (code in GUIDANCE) return code as InputErrorCode;
  return 'UNKNOWN';
}

export function detectErrorCodeFromMessage(raw?: string): InputErrorCode {
  const text = (raw || '').toLowerCase();
  if (!text) return 'UNKNOWN';
  if (text.includes('100mb') || text.includes('file exceeds')) return 'INPUT_TOO_LARGE';
  if (text.includes('package-lock') && text.includes('cannot be parsed')) return 'WRONG_FILE_TYPE';
  if (text.includes('invalid sarif')) return 'INVALID_SARIF';
  if (text.includes('invalid json')) return 'INVALID_JSON';
  if (text.includes('quotaexceeded') || text.includes('databaseclosederror') || text.includes('full disk')) return 'LOCAL_STORAGE_QUOTA';
  if (text.includes('worker script failed')) return 'WORKER_SCRIPT_ERROR';
  if (text.includes('lockfile') && text.includes('parse')) return 'LOCKFILE_PARSE_FAIL';
  return 'UNKNOWN';
}

export function toUiInputError(input: Partial<StructuredInputError> & { code?: string; error?: string }): UiInputError {
  const detected = detectErrorCodeFromMessage(input.technicalDetail || input.error || input.userMessage);
  const code = normalizeCode(input.code) || detected;
  const finalCode = code === 'UNKNOWN' ? detected : code;
  const template = GUIDANCE[finalCode];
  return {
    code: finalCode,
    title: template.title,
    userMessage: input.userMessage || template.userMessage,
    technicalDetail: input.technicalDetail || input.error,
    recoverySteps: (input.recoverySteps && input.recoverySteps.length > 0) ? input.recoverySteps : template.recoverySteps,
    retryable: input.retryable ?? template.retryable,
  };
}

export function buildStructuredInputError(
  code: InputErrorCode,
  technicalDetail?: string,
  userMessage?: string
): StructuredInputError {
  const template = GUIDANCE[code];
  return {
    code,
    userMessage: userMessage || template.userMessage,
    technicalDetail,
    recoverySteps: template.recoverySteps,
    retryable: template.retryable,
  };
}
