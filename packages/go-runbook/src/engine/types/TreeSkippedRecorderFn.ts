/** Records, in the coverage of the execution, a descent that could not be read for lack of an identifier. */
export type TreeSkippedRecorderFn = (target: string, readStepId: string | undefined) => void;
