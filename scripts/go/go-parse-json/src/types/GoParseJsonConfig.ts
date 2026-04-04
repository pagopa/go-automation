export interface GoParseJsonConfig {
  readonly inputFile: string;
  readonly field: string;
  readonly outputFile: string | undefined;
  readonly outputFormat: string;
  readonly filter: string | undefined;
  readonly jsonPath: string | undefined;
  readonly startTime: string | undefined;
  readonly endTime: string | undefined;
  readonly tail: boolean | undefined;
}
