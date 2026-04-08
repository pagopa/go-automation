export interface GoParseJsonConfig {
  readonly inputFile: string;
  readonly field: ReadonlyArray<string>;
  readonly outputFile: string | undefined;
  readonly outputFormat: string;
  readonly filter: ReadonlyArray<string> | undefined;
  readonly jsonPath: string | undefined;
}
