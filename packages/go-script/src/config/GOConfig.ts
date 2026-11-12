/**
 * GOConfig - Resolved configuration store
 *
 * Holds the configuration values resolved by the loader (already type-converted)
 * together with the source each value came from (CLI, env, preset, ...).
 *
 * It is the single in-memory representation of a script's configuration: GOScript
 * keeps one instance internally and exposes it (read + override) to lifecycle
 * hooks, so a hook can derive or remap values — e.g. compose an S3 URI from an
 * environment-specific bucket and the active preset name — with the change
 * flowing transparently to `getConfiguration()` and the config summary.
 *
 * Keys are dotted parameter names (e.g. `artifact.s3.location`).
 */

/** Default source label attributed to values written via {@link GOConfig.set}. */
export const GOCONFIG_PREPARED_SOURCE = 'prepared';

export class GOConfig {
  private readonly values: Map<string, unknown>;
  private readonly sources: Map<string, string>;

  /**
   * @param values - Initial resolved values (dotted key → converted value)
   * @param sources - Source label per key (dotted key → source)
   */
  constructor(values?: Record<string, unknown>, sources?: ReadonlyMap<string, string>) {
    this.values = new Map(Object.entries(values ?? {}));
    this.sources = new Map(sources ?? []);
  }

  /** Whether a value is present for `name`. */
  has(name: string): boolean {
    return this.values.has(name);
  }

  /** Raw value for `name` (already type-converted), or undefined. */
  get(name: string): unknown {
    return this.values.get(name);
  }

  /** Value for `name` as a string, or undefined if absent or not a string. */
  getString(name: string): string | undefined {
    const value = this.values.get(name);
    return typeof value === 'string' ? value : undefined;
  }

  /** Value for `name` as a readonly string array, or undefined if absent or not an array. */
  getStringArray(name: string): ReadonlyArray<string> | undefined {
    const value = this.values.get(name);
    return Array.isArray(value) ? (value as string[]) : undefined;
  }

  /**
   * Set (or override) a value, tracking its source.
   *
   * @param name - Dotted parameter name
   * @param value - Converted value to store
   * @param source - Source label (defaults to {@link GOCONFIG_PREPARED_SOURCE})
   */
  set(name: string, value: unknown, source: string = GOCONFIG_PREPARED_SOURCE): void {
    this.values.set(name, value);
    this.sources.set(name, source);
  }

  /** Source label for `name`, or undefined if absent. */
  sourceOf(name: string): string | undefined {
    return this.sources.get(name);
  }

  /** Plain-object snapshot of the values (e.g. for typed config extraction). */
  toRecord(): Record<string, unknown> {
    return Object.fromEntries(this.values);
  }
}
