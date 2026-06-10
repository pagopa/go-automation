import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { StepResult } from '../../types/StepResult.js';

export interface PrepareServiceSectionConfig {
  readonly id: string;
  readonly label: string;
  readonly serviceName: string;
  readonly logGroup: string;
}

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
    context.logger?.newline();
    context.logger?.text(`    ═══ Servizio: ${this.serviceName} ═══`);
    context.logger?.text(`      ├─ Log group: ${this.logGroup}`);

    return {
      success: true,
      output: undefined,
    };
  }
}
