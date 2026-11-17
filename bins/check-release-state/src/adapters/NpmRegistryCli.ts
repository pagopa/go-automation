import type { RunCommandFn } from '../types/RunCommandFn.js';
import type { RegistryPort } from '../types/RegistryPort.js';

/** Registry of the published packages (`publishConfig.registry`). */
const PUBLISH_REGISTRY = 'https://npm.pkg.github.com';

/**
 * {@link RegistryPort} on the `npm` command line. Authentication comes from the npm configuration
 * written by `actions/setup-node` (`registry-url`, `scope`, `NODE_AUTH_TOKEN`).
 */
export class NpmRegistryCli implements RegistryPort {
  /**
   * @param run - Command runner
   * @param cwd - Folder to run npm from
   * @param registry - Registry URL
   */
  constructor(
    private readonly run: RunCommandFn,
    private readonly cwd: string,
    private readonly registry: string = PUBLISH_REGISTRY,
  ) {}

  public versions(name: string): ReadonlyArray<string> {
    const value = this.view(name, 'versions');
    if (value === undefined) return [];
    if (typeof value === 'string') return [value];
    if (Array.isArray(value) && value.every((item): item is string => typeof item === 'string')) return value;
    throw new Error(`unexpected npm view ${name} versions output`);
  }

  public distTags(name: string): Readonly<Record<string, string>> {
    const value = this.view(name, 'dist-tags');
    if (value === undefined) return {};
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(`unexpected npm view ${name} dist-tags output`);
    }
    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
  }

  /** `npm view <name> <field> --json`; `undefined` when the package does not exist (E404). */
  private view(name: string, field: string): unknown {
    const result = this.run('npm', ['view', name, field, '--json', `--registry=${this.registry}`], this.cwd);
    if (result.status !== 0) {
      if (/E404|404 Not Found|is not in this registry/u.test(`${result.stdout}${result.stderr}`)) return undefined;
      throw new Error(`npm view ${name} ${field} failed: ${result.stderr.trim().slice(0, 300)}`);
    }
    const text = result.stdout.trim();
    return text === '' ? undefined : (JSON.parse(text) as unknown);
  }
}
