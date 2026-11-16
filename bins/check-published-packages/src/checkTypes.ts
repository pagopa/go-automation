import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Type-checks a file that imports every specifier, with `skipLibCheck: false`: the published `.d.ts`
 * must be complete and must not reference packages the scenario did not install.
 *
 * @param directory - Consumer project
 * @param specifiers - Specifiers to import
 * @param repositoryRoot - Monorepo root, for its TypeScript and `@types/node`
 * @returns The compiler diagnostics, empty when the check passes
 */
export async function checkTypes(
  directory: string,
  specifiers: ReadonlyArray<string>,
  repositoryRoot: string,
): Promise<ReadonlyArray<string>> {
  if (specifiers.length === 0) return [];
  const source = [
    ...specifiers.map((spec, index) => `import * as module${String(index)} from ${JSON.stringify(spec)};`),
    `export const modules = [${specifiers.map((_, index) => `module${String(index)}`).join(', ')}];`,
    '',
  ].join('\n');
  await fs.writeFile(path.join(directory, 'check.ts'), source);
  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      exactOptionalPropertyTypes: true,
      skipLibCheck: false,
      noEmit: true,
      types: ['node'],
      typeRoots: [path.join(repositoryRoot, 'node_modules', '@types')],
    },
    files: ['check.ts'],
  };
  await fs.writeFile(path.join(directory, 'tsconfig.check.json'), JSON.stringify(tsconfig, null, 2));
  const tsc = path.join(repositoryRoot, 'node_modules', 'typescript', 'bin', 'tsc');
  const result = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.check.json'], { cwd: directory, encoding: 'utf8' });
  if (result.error === undefined && result.status === 0 && result.signal === null) return [];
  const diagnostics = `${result.stdout}${result.stderr}`.split('\n').filter((line) => line.includes('error TS'));
  if (diagnostics.length > 0) return diagnostics.slice(0, 20);
  // No diagnostic but no success either (missing compiler, crash, signal): never a pass.
  return [
    `type check did not complete: status ${String(result.status)}, signal ${String(result.signal)}` +
      `${result.error === undefined ? '' : `, ${result.error.message}`}; ${result.stderr.trim().slice(0, 300)}`,
  ];
}
