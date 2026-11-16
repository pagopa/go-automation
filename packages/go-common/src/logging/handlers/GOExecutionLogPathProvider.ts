/**
 * Source of the default execution log path for `GOFileLoggerHandler`.
 *
 * `GOPaths` satisfies this contract structurally, so callers keep passing their
 * `GOPaths` instance while the logging module stays independent from the
 * script-level path resolver.
 */
export interface GOExecutionLogPathProvider {
  /**
   * Returns the absolute path of the execution log file.
   *
   * @returns The absolute execution log path
   */
  getExecutionLogFilePath(): string;
}
