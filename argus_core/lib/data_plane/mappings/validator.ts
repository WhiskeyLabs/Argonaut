import { getIndexContract } from './contracts';
import { ArgonautIndexName, IndexContract, MappingField, MappingDynamic } from './types';

type UnknownRecord = Record<string, unknown>;

export interface ValidationIssue {
    code: 'UNKNOWN_FIELD' | 'TYPE_MISMATCH' | 'INVALID_OBJECT';
    path: string;
    message: string;
}

export interface ValidationResult {
    ok: boolean;
    issues: ValidationIssue[];
}

export function validateDocumentAgainstIndex(index: ArgonautIndexName, document: unknown): ValidationResult {
    const contract = getIndexContract(index);
    return validateDocument(contract, document);
}

export function validateDocument(contract: IndexContract, document: unknown): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!isRecord(document)) {
        return {
            ok: false,
            issues: [{
                code: 'INVALID_OBJECT',
                path: '$',
                message: 'Document must be an object.',
            }],
        };
    }

    validateObject(contract.mappings.dynamic, contract.mappings.properties, document, '$', issues);

    return {
        ok: issues.length === 0,
        issues,
    };
}

export function getFieldType(contract: IndexContract, fieldPath: string): string | null {
    const tokens = fieldPath.split('.').filter((token) => token.length > 0);
    let current: MappingField | null = {
        type: 'object',
        properties: contract.mappings.properties,
        dynamic: contract.mappings.dynamic,
    };

    for (const token of tokens) {
        if (!current?.properties || !current.properties[token]) {
            return null;
        }

        current = current.properties[token];
    }

    return current?.type ?? null;
}

function validateObject(
    dynamic: MappingDynamic,
    properties: Record<string, MappingField>,
    value: UnknownRecord,
    path: string,
    issues: ValidationIssue[],
): void {
    const known = new Set(Object.keys(properties));

    for (const key of Object.keys(value)) {
        if (!known.has(key)) {
            if (dynamic === 'strict') {
                issues.push({
                    code: 'UNKNOWN_FIELD',
                    path: `${path}.${key}`,
                    message: `Unknown field ${key} is not allowed under strict mapping.`,
                });
            }
            continue;
        }

        const field = properties[key];
        const fieldValue = value[key];
        validateField(field, fieldValue, `${path}.${key}`, issues);
    }
}

function validateField(field: MappingField, value: unknown, path: string, issues: ValidationIssue[]): void {
    if (value === undefined || value === null) {
        return;
    }

    if (field.type === 'object' || field.properties) {
        if (!isRecord(value)) {
            issues.push({
                code: 'INVALID_OBJECT',
                path,
                message: `Expected object at ${path}.`,
            });
            return;
        }

        if (field.enabled === false) {
            return;
        }

        validateObject(field.dynamic ?? 'strict', field.properties ?? {}, value, path, issues);
        return;
    }

    switch (field.type) {
        case 'keyword': {
            if (typeof value === 'string') return;
            if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) return;
            issues.push(typeMismatch(path, 'keyword', value));
            return;
        }
        case 'text': {
            if (typeof value !== 'string') {
                issues.push(typeMismatch(path, 'text', value));
            }
            return;
        }
        case 'boolean': {
            if (typeof value !== 'boolean') {
                issues.push(typeMismatch(path, 'boolean', value));
            }
            return;
        }
        case 'integer': {
            if (typeof value !== 'number' || !Number.isInteger(value)) {
                issues.push(typeMismatch(path, 'integer', value));
            }
            return;
        }
        case 'float': {
            if (typeof value !== 'number' || !Number.isFinite(value)) {
                issues.push(typeMismatch(path, 'float', value));
            }
            return;
        }
        case 'date': {
            if (
                (typeof value === 'number' && Number.isFinite(value))
                || (typeof value === 'string' && value.trim().length > 0)
            ) {
                return;
            }
            issues.push(typeMismatch(path, 'date', value));
            return;
        }
        default:
            return;
    }
}

function typeMismatch(path: string, expected: string, value: unknown): ValidationIssue {
    return {
        code: 'TYPE_MISMATCH',
        path,
        message: `Expected ${expected} at ${path}, got ${typeof value}.`,
    };
}

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
