/**
 * Strategy used to compare a `KnownUrl.url` against a URL observed in a log.
 *
 * - `exact`: full string equality.
 * - `prefix` (default): the observed URL must start with `KnownUrl.url`.
 * - `regex`: `KnownUrl.url` is compiled as a regular expression and
 *   matched against the observed URL with `RegExp.test`.
 */
export type KnownUrlMatchType = 'exact' | 'prefix' | 'regex';
