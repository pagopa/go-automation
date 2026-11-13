/**
 * Path options of a GOScript.
 */
export interface GOScriptPathsOptions {
  /**
   * Explicit go-automation root. It takes precedence over `GO_ROOT_DIR` and over the
   * upward search for the root markers, and applies to this script only: no process-wide
   * environment variable or detection cache is modified.
   */
  readonly rootDir?: string | undefined;
}
