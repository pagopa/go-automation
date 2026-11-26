/** Whether a row, by its trace field and its message, belongs to one of the traces of the matcher. */
export type TraceRowMatcherFn = (traceField: string, message: string) => boolean;
