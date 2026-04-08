import { Core } from '@go-automation/go-common';

export interface GoJsonParserConfig {
  readonly inputFile: string;
  readonly field: string;
  readonly outputFile: string | undefined;
  readonly outputFormat: Core.GOExportFormat;
}
