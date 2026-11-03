/**
 * Parameter `values` of a mapping transform: a list (`emptyIfIn`) or a
 * dictionary (`map`).
 */
export type MappingTransformValues = ReadonlyArray<string> | Readonly<Record<string, string>>;
