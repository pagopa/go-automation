/**
 * Looks up an environment variable by name; injectable in tests.
 */
export type EnvironmentVariableLookupFn = (name: string) => string | undefined;
