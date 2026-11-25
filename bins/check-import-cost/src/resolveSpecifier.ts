import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Resolves a published specifier to the compiled file of its workspace package, through the
 * `exports` of the manifest (`default` condition), without relying on any consumer's `node_modules`.
 *
 * @param repositoryRoot - Monorepo root
 * @param specifier - e.g. `@pagopa/go-runbook/toolkits/common`
 * @returns Absolute path of the `dist` file
 * @throws Error when the package or the subpath does not exist
 */
export async function resolveSpecifier(repositoryRoot: string, specifier: string): Promise<string> {
  const [scope, name, ...rest] = specifier.split('/');
  if (scope === undefined || name === undefined) throw new Error(`Not a scoped specifier: ${specifier}`);
  const directory = path.join(repositoryRoot, 'packages', name);
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8')) as {
    readonly name?: string;
    readonly exports?: Readonly<Record<string, unknown>>;
  };
  if (manifest.name !== `${scope}/${name}`)
    throw new Error(`${specifier}: packages/${name} is ${String(manifest.name)}`);
  const subpath = rest.length === 0 ? '.' : `./${rest.join('/')}`;
  const target = manifest.exports?.[subpath];
  const file =
    typeof target === 'string'
      ? target
      : typeof target === 'object' && target !== null
        ? (target as Readonly<Record<string, unknown>>)['default']
        : undefined;
  if (typeof file !== 'string') throw new Error(`${specifier}: no "${subpath}" export with a default condition`);
  return path.join(directory, file);
}
