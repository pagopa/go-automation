/** Synchronous code run inside the temporary environment. */
type EnvScopedFn<T> = () => T;

/**
 * Runs `fn` synchronously with temporary environment variables, restoring
 * the previous values afterwards (even when `fn` throws).
 *
 * @param env - Variables to set; `undefined` deletes the variable for the duration
 * @param fn - Synchronous code to run
 * @returns What `fn` returns
 */
export function withEnv<T>(env: Readonly<Record<string, string | undefined>>, fn: EnvScopedFn<T>): T {
  const previous = new Map(Object.keys(env).map((key) => [key, process.env[key]]));
  const apply = (values: Iterable<readonly [string, string | undefined]>): void => {
    for (const [key, value] of values) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };

  apply(Object.entries(env));
  try {
    return fn();
  } finally {
    apply(previous);
  }
}
