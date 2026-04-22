import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { StepResult } from '../../types/StepResult.js';
import type { RunbookContext } from '../../types/RunbookContext.js';

/**
 * Configuration for the MapStep.
 */
type MapArrayMappingFn = (element: unknown, index: number) => unknown;

interface MapArrayConfig {
  /** Unique identifier of the step within the runbook */
  readonly id: string;
  /** Human-readable label for logs and UI */
  readonly label: string;
  /** Step ID whose output to read from context.stepResults (must be an array) */
  readonly fromStep: string;
  /** Mapping function applied to each element of the source array */
  readonly mappingFn: MapArrayMappingFn;
}

/**
 * Step that applies a mapping function to each element of an array from a previous step's output.
 * The source step output must be an array; otherwise the step fails.
 *
 * @example
 * ```typescript
 * const step = mapArray({
 *   id: 'map-names',
 *   label: 'Extract names from users',
 *   fromStep: 'fetch-users',
 *   mappingFn: (user) => (user as { name: string }).name,
 * });
 * ```
 */
class MapStep implements Step<unknown[]> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'transform';

  private readonly fromStep: string;
  private readonly mappingFn: MapArrayMappingFn;

  constructor(config: MapArrayConfig) {
    this.id = config.id;
    this.label = config.label;
    this.fromStep = config.fromStep;
    this.mappingFn = config.mappingFn;
  }

  /**
   * Executes the mapping function over the source array.
   *
   * @param context - The current runbook execution context
   * @returns A StepResult containing the mapped array
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<unknown[]>> {
    const sourceOutput = context.stepResults.get(this.fromStep);

    if (sourceOutput === undefined) {
      return {
        success: false,
        error: `Step output not found for stepId: "${this.fromStep}"`,
      };
    }

    if (!Array.isArray(sourceOutput)) {
      return {
        success: false,
        error: `Output of step "${this.fromStep}" is not an array`,
      };
    }

    const mapped = sourceOutput.map((element: unknown, index: number) => this.mappingFn(element, index));

    return {
      success: true,
      output: mapped,
    };
  }
}

/**
 * Factory function that creates a MapStep instance.
 *
 * @param config - Configuration for the map array step
 * @returns A Step that maps each element of a previous step's array output
 */
export function mapArray(config: MapArrayConfig): Step<unknown[]> {
  return new MapStep(config);
}
