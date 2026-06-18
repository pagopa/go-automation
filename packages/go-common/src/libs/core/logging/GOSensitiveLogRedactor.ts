const REDACTED_VALUE = '<redacted>';
const REDACTED_JSON_VALUE = '[REDACTED]';

const JSON_STRING_FIELD_PATTERN = /"([^"\r\n]+)"([ \t]*:[ \t]*)"[^"\r\n]*"/gu;
const JSON_PRIMITIVE_FIELD_PATTERN = /"([^"\r\n]+)"([ \t]*:[ \t]*)([^\s,}\]]+)/gu;
const SENSITIVE_ASSIGNMENT_PATTERN =
  /\b((?:cookie|set-cookie|x-api-key|api[-_.]?key|client[-_.]?secret|access[-_.]?token|refresh[-_.]?token|id[-_.]?token|password|passwd|pwd|secret|token|credentials?))([ \t]*[:=][ \t]*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}\]"']+)/giu;

const AUTHORIZATION_SCHEME_PATTERN = /\b(authorization[ \t]*[:=][ \t]*)(bearer|basic)([ \t]+)[^\s,;]+/giu;
const AUTHORIZATION_VALUE_PATTERN = /\b(authorization[ \t]*[:=][ \t]*)(?!bearer[ \t]|basic[ \t])[^\s,;]+/giu;

const URL_CREDENTIALS_PATTERN = /([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+):([^/\s@]+)@/giu;
const JWT_PATTERN = /\beyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+\b/giu;
const SLACK_TOKEN_PATTERN = /\bxox[a-z]-[a-z0-9-]+\b/giu;
const AWS_ACCESS_KEY_ID_PATTERN = /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/gu;

const WRAPPED_SECRET_VALUE_KEYS = new Set([
  'accesstoken',
  'apikey',
  'authorization',
  'body',
  'clientsecret',
  'credential',
  'credentials',
  'data',
  'displayvalue',
  'idtoken',
  'password',
  'passwd',
  'payload',
  'pwd',
  'rawvalue',
  'refreshtoken',
  'secret',
  'token',
  'value',
]);

const WRAPPED_SECRET_METADATA_KEYS = new Set([
  'createdat',
  'description',
  'encoding',
  'format',
  'key',
  'label',
  'name',
  'origin',
  'path',
  'provider',
  'reason',
  'source',
  'status',
  'timestamp',
  'type',
  'updatedat',
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isSensitiveKey(key: string): boolean {
  const normalizedKey = normalizeKey(key);

  return (
    normalizedKey === 'authorization' ||
    normalizedKey.includes('cookie') ||
    normalizedKey.includes('secret') ||
    normalizedKey.includes('password') ||
    normalizedKey.includes('passwd') ||
    normalizedKey.includes('credential') ||
    normalizedKey.includes('apikey') ||
    normalizedKey.includes('privatekey') ||
    normalizedKey.endsWith('token') ||
    normalizedKey.endsWith('pwd')
  );
}

function redactJsonStringField(match: string, key: string, separator: string): string {
  if (!isSensitiveKey(key)) {
    return match;
  }

  return `"${key}"${separator}"${REDACTED_JSON_VALUE}"`;
}

function redactJsonPrimitiveField(match: string, key: string, separator: string): string {
  if (!isSensitiveKey(key)) {
    return match;
  }

  return `"${key}"${separator}"${REDACTED_JSON_VALUE}"`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

function isWrappedSecretValueKey(key: string): boolean {
  return WRAPPED_SECRET_VALUE_KEYS.has(normalizeKey(key));
}

function isWrappedSecretMetadataKey(key: string): boolean {
  return WRAPPED_SECRET_METADATA_KEYS.has(normalizeKey(key));
}

function isMetadataWrappedSecret(value: unknown): value is Record<string, unknown> {
  if (!isPlainRecord(value)) {
    return false;
  }

  const keys = Object.keys(value);
  return (
    keys.some((key) => isWrappedSecretValueKey(key) || isSensitiveKey(key)) && keys.some(isWrappedSecretMetadataKey)
  );
}

function redactSensitiveStructuredEntry(value: unknown, seen: WeakSet<object>): unknown {
  if (!isMetadataWrappedSecret(value)) {
    return REDACTED_JSON_VALUE;
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    redacted[key] =
      isWrappedSecretValueKey(key) || isSensitiveKey(key)
        ? REDACTED_JSON_VALUE
        : redactSensitiveLogValueInternal(nestedValue, seen);
  }

  return redacted;
}

/**
 * Redact common credentials and bearer material from free-form log messages.
 *
 * This is intentionally conservative and best-effort: callers should still avoid
 * logging raw sensitive objects, but logger sinks apply this as a final guard.
 */
export function redactSensitiveLogText(text: string): string {
  return text
    .replace(JSON_STRING_FIELD_PATTERN, redactJsonStringField)
    .replace(JSON_PRIMITIVE_FIELD_PATTERN, redactJsonPrimitiveField)
    .replace(AUTHORIZATION_SCHEME_PATTERN, `$1$2$3${REDACTED_VALUE}`)
    .replace(AUTHORIZATION_VALUE_PATTERN, `$1${REDACTED_VALUE}`)
    .replace(SENSITIVE_ASSIGNMENT_PATTERN, `$1$2${REDACTED_VALUE}`)
    .replace(URL_CREDENTIALS_PATTERN, `$1${REDACTED_VALUE}@`)
    .replace(JWT_PATTERN, REDACTED_VALUE)
    .replace(SLACK_TOKEN_PATTERN, REDACTED_VALUE)
    .replace(AWS_ACCESS_KEY_ID_PATTERN, REDACTED_VALUE);
}

/**
 * Redact sensitive-looking keys and string values from structured log payloads.
 */
export function redactSensitiveLogValue(value: unknown): unknown {
  return redactSensitiveLogValueInternal(value, new WeakSet<object>());
}

function redactSensitiveLogValueInternal(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    return redactSensitiveLogText(value);
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveLogValueInternal(item, seen));
  }

  if (value instanceof Date) {
    return value;
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    redacted[key] = isSensitiveKey(key)
      ? redactSensitiveStructuredEntry(nestedValue, seen)
      : redactSensitiveLogValueInternal(nestedValue, seen);
  }

  return redacted;
}
