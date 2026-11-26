import type { RunbookContext, Step, StepKind, StepResult } from '../../../../../engine/index.js';

export interface PrepareServiceSectionConfig {
  readonly id: string;
  readonly label: string;
  readonly serviceName: string;
  readonly logGroup: string;
}

/**
 * Opens the section of a service in the report with its log group.
 */
export class PrepareServiceSectionStep implements Step<void> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'control';

  private readonly serviceName: string;
  private readonly logGroup: string;

  constructor(config: PrepareServiceSectionConfig) {
    this.id = config.id;
    this.label = config.label;
    this.serviceName = config.serviceName;
    this.logGroup = config.logGroup;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<void>> {
    context.services.reporter.section(`Servizio: ${this.serviceName}`);
    context.services.reporter.add({ label: `Log group: ${this.logGroup}` });

    return {
      success: true,
      output: undefined,
    };
  }
}
