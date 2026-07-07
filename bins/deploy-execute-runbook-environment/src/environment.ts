import { readFile } from 'node:fs/promises';

export async function readEnvironmentFile(path: string): Promise<Record<string, string>> {
  const source = await readFile(path, 'utf8');
  const result: Record<string, string> = {};
  const keys = new Set<string>();
  for (const [index, raw] of source.split(/\r?\n/u).entries()) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) throw new Error(`${path}:${String(index + 1)} is not KEY=VALUE`);
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!/^[A-Z][A-Z0-9_]*$/u.test(key)) throw new Error(`${path}:${String(index + 1)} has an invalid key`);
    if (keys.has(key)) throw new Error(`${path}:${String(index + 1)} duplicates key ${key}`);
    keys.add(key);
    result[key] = value;
  }
  return result;
}
