export interface AnalyzeInteropApplicationLogsStepConfig {
  readonly id: string;
  readonly label: string;
  readonly fromStep: string;
  readonly varPrefix: string;
  /** Optional aggregate field whose numeric values represent the original log count. */
  readonly countField?: string;
}
