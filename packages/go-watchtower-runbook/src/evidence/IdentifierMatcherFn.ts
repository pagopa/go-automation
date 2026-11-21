/** Whether an identifier of a detected case refers to one of the traces of an analysis. */
export type IdentifierMatcherFn = (identifier: string, isTrace: boolean) => boolean;
