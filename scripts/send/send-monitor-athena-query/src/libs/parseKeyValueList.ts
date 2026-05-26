export function parseKeyValueList(entries: ReadonlyArray<string>): Record<string, string> {
  const values = createDictionary();

  for (const entry of entries) {
    const trimmed = entry.trim();
    if (trimmed.length === 0) {
      continue;
    }

    if (trimmed.startsWith('{')) {
      for (const [key, value] of Object.entries(parseJsonObjectEntry(trimmed))) {
        values[key] = value;
      }
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      throw new Error(`Invalid key/value entry '${entry}'. Expected key=value or a JSON object.`);
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key.length === 0) {
      throw new Error(`Invalid key/value entry '${entry}'. Key cannot be empty.`);
    }
    validateSafeKey(key);

    values[key] = value;
  }

  return values;
}

function parseJsonObjectEntry(entry: string): Record<string, string> {
  const parsed = JSON.parse(entry) as unknown;
  if (!isPlainRecord(parsed)) {
    throw new Error(`Invalid JSON key/value entry '${entry}'. Expected an object.`);
  }

  const values = createDictionary();
  for (const [key, value] of Object.entries(parsed)) {
    validateSafeKey(key);
    values[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return values;
}

function createDictionary(): Record<string, string> {
  return Object.create(null) as Record<string, string>;
}

function validateSafeKey(key: string): void {
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
    throw new Error(`Unsafe key/value entry key '${key}'`);
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
