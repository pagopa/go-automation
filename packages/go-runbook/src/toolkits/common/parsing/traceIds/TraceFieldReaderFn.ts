/** Reads the structured trace field of a row; empty when the row has none. */
export type TraceFieldReaderFn<T> = (row: T) => string;
