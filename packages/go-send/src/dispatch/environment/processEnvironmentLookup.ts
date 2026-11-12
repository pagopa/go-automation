/**
 * Default variable lookup of {@link ./EnvironmentLoader.EnvironmentLoader}:
 * the process environment (set from the shell).
 *
 * @param name - Variable name
 * @returns The value, if set
 */
export function processEnvironmentLookup(name: string): string | undefined {
  return process.env[name];
}
