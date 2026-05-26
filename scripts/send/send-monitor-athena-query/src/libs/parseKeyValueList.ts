export function parseKeyValueList(entries: ReadonlyArray<string>): Record<string, string> {
  const values: Record<string, string> = {};

  for (const entry of entries) {
    const trimmed = entry.trim();
    if (trimmed.length === 0) {
      continue;
    }

    if (trimmed.startsWith('{')) {
      Object.assign(values, parseJsonObjectEntry(trimmed));
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

    values[key] = value;
  }

  return values;
}

function parseJsonObjectEntry(entry: string): Record<string, string> {
  const parsed = JSON.parse(entry) as unknown;
  if (!isPlainRecord(parsed)) {
    throw new Error(`Invalid JSON key/value entry '${entry}'. Expected an object.`);
  }

  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    values[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return values;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
