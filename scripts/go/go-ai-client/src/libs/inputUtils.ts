import * as fs from 'node:fs';
import * as path from 'node:path';

export function loadInput(inputArg: string): string {
  const filePath = path.resolve(inputArg);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf-8');
  }
  return inputArg;
}

export function stabilize(raw: string): unknown {
  const stripped = raw
    .replace(/^```(?:json)?\n?/m, '')
    .replace(/\n?```$/m, '')
    .trim();
  try {
    return JSON.parse(stripped) as unknown;
  } catch {
    return { text: stripped };
  }
}
