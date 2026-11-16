import { spawnSync } from 'node:child_process';

/**
 * Imports each specifier in a fresh Node process from the consumer project.
 *
 * @param directory - Consumer project
 * @param specifiers - Specifiers to import
 * @returns One message per specifier that fails to import
 */
export function checkImports(directory: string, specifiers: ReadonlyArray<string>): ReadonlyArray<string> {
  const failures: string[] = [];
  for (const spec of specifiers) {
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', `await import(${JSON.stringify(spec)});`],
      {
        cwd: directory,
        encoding: 'utf8',
      },
    );
    if (result.status !== 0) {
      failures.push(`import ${spec} failed: ${firstLine(result.stderr)}`);
    }
  }
  return failures;
}

/** The line that names the error (`Error [ERR_…]: …`), or the first non-empty line. */
function firstLine(text: string): string {
  const lines = text.split('\n').map((line) => line.trim());
  const line =
    lines.find((candidate) => /^[A-Za-z]*Error\b/u.test(candidate)) ?? lines.find((candidate) => candidate !== '');
  return (line ?? text).slice(0, 300);
}
