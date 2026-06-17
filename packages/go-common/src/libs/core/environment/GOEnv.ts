/**
 * GOEnv - Environment variable accessor
 *
 * Thin, typed read access to process environment variables. It exists so code
 * outside the go-common boundary (scripts, lifecycle hooks) can read env vars
 * through a go-common abstraction instead of touching `process.env` directly
 * (which is forbidden in scripts by the lint rules / CONVENTIONS.md).
 *
 * Typical use is from a GOScript lifecycle hook via the hook context
 * (`context.env`), e.g. to read an infrastructure-provided value that is not a
 * declared configuration parameter.
 */

export class GOEnv {
  private readonly source: NodeJS.ProcessEnv;

  /**
   * @param source - Environment source (defaults to the live `process.env`).
   *   A custom record can be injected in tests.
   */
  constructor(source: NodeJS.ProcessEnv = process.env) {
    this.source = source;
  }

  /**
   * Value of the environment variable `name`, or undefined if unset.
   *
   * @param name - Environment variable name (case-sensitive)
   */
  get(name: string): string | undefined {
    return this.source[name];
  }

  /** Whether the environment variable `name` is set to a non-empty value. */
  has(name: string): boolean {
    const value = this.source[name];
    return value !== undefined && value.length > 0;
  }
}
