/** The identity of a row (`@ptr`, or time, log stream and message), to merge reads and to exclude ancestors' rows. */
export type TreeRowIdentityFn = (row: unknown) => string;
