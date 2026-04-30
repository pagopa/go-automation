/**
 * Script configuration interface
 * Represents all validated configuration parameters
 */
export interface GoParseJsonConfig {
  /** Input file path */
  readonly inputFile: string;

  /** Fields to parse */
  readonly field: ReadonlyArray<string>;

  /** Output file path */
  readonly outputFile?: string;

  /** Output format */
  readonly outputFormat: string;

  /** Filter parameters */
  readonly filter?: ReadonlyArray<string>;

  /** JSON path expression */
  readonly jsonPath?: string;
}
