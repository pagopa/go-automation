import type { Runbook } from '../types/Runbook.js';
import type { RunbookMetadata } from '../types/RunbookMetadata.js';
import type { Step } from '../types/Step.js';
import type { StepDescriptor } from '../types/StepDescriptor.js';
import type { KnownCase } from '../types/KnownCase.js';
import type { IfBranchConfig } from '../types/IfBranchConfig.js';
import type { SwitchBranchConfig } from '../types/SwitchBranchConfig.js';
import type { CaseAction } from '../actions/CaseAction.js';
import type { ValidationErrorEntry } from '../validation/ValidationErrorEntry.js';
import type { GoToReference } from '../validation/GoToGraphAnalyzer.js';
import { RunbookValidationError } from '../validation/RunbookValidationError.js';
import { GoToGraphAnalyzer } from '../validation/GoToGraphAnalyzer.js';
import { IfBranchStep } from '../steps/control/IfBranchStep.js';
import { SwitchBranchStep } from '../steps/control/SwitchBranchStep.js';

/**
 * Type guard for IfStep with goTo references.
 */
function isIfStepWithGoTo(step: Step): step is Step & {
  readonly thenGoTo?: string;
  readonly elseGoTo?: string;
} {
  return step.kind === 'control' && ('thenGoTo' in step || 'elseGoTo' in step);
}

/**
 * Type guard for SwitchStep with goTo cases.
 */
function isSwitchStepWithGoTo(step: Step): step is Step & {
  readonly goToCases: ReadonlyMap<string, string>;
} {
  return step.kind === 'control' && 'goToCases' in step;
}

/**
 * Fluent builder for creating validated runbook definitions.
 * Includes automatic validation before build (v5 feature).
 *
 * @example
 * ```typescript
 * const runbook = RunbookBuilder.create('alarm-api-gw-5xx')
 *   .metadata({
 *     name: 'API Gateway 5xx Alarm',
 *     description: 'Investigates 5xx alarms on API Gateway',
 *     version: '1.0.0',
 *     type: 'alarm-resolution',
 *     team: 'GO',
 *     tags: ['api-gateway', '5xx'],
 *   })
 *   .step(queryCloudWatchLogs({ ... }))
 *   .step(extractField({ ... }), { continueOnFailure: true })
 *   .knownCase({ ... })
 *   .fallback(logAction({ ... }))
 *   .build();
 * ```
 */
export class RunbookBuilder {
  private readonly id: string;
  private meta?: Omit<RunbookMetadata, 'id'>;
  private readonly stepDescriptors: StepDescriptor[] = [];
  private readonly cases: KnownCase[] = [];
  private fallbackAction?: CaseAction;
  private iterationsLimit?: number;

  private constructor(id: string) {
    this.id = id;
  }

  /**
   * Creates a new builder for a runbook with the specified ID.
   *
   * @param id - Unique runbook identifier
   * @returns New builder instance
   */
  static create(id: string): RunbookBuilder {
    return new RunbookBuilder(id);
  }

  /**
   * Sets the runbook metadata.
   *
   * @param meta - Metadata without the ID (ID is set in create())
   * @returns This builder for chaining
   */
  metadata(meta: Omit<RunbookMetadata, 'id'>): RunbookBuilder {
    this.meta = meta;
    return this;
  }

  /**
   * Adds a step to the runbook.
   * Supports an optional second parameter for execution options (v5).
   *
   * @param step - The step to add
   * @param options - Execution options (e.g. continueOnFailure)
   * @returns This builder for chaining
   */
  step(step: Step, options?: { readonly continueOnFailure?: boolean }): RunbookBuilder {
    const descriptor: StepDescriptor = { step };
    if (options?.continueOnFailure === true) {
      this.stepDescriptors.push({ step, continueOnFailure: true });
    } else {
      this.stepDescriptors.push(descriptor);
    }
    return this;
  }

  /**
   * (v5) Adds an IfStep with inline sub-pipelines.
   * Alternative to ifCondition with goTo: the then/else pipelines
   * are executed inline in a child context.
   *
   * @param config - If branch configuration with sub-pipelines
   * @returns This builder for chaining
   */
  ifBranch(config: IfBranchConfig): RunbookBuilder {
    const branchStep = new IfBranchStep(config);
    this.stepDescriptors.push({ step: branchStep });
    return this;
  }

  /**
   * (v5) Adds a SwitchStep with inline sub-pipelines.
   *
   * @param config - Switch branch configuration with sub-pipelines
   * @returns This builder for chaining
   */
  switchBranch(config: SwitchBranchConfig): RunbookBuilder {
    const branchStep = new SwitchBranchStep(config);
    this.stepDescriptors.push({ step: branchStep });
    return this;
  }

  /**
   * Adds a known case to the runbook.
   *
   * @param knownCase - Known case definition
   * @returns This builder for chaining
   */
  knownCase(knownCase: KnownCase): RunbookBuilder {
    this.cases.push(knownCase);
    return this;
  }

  /**
   * Sets the fallback action for when no known case matches.
   *
   * @param action - Fallback action
   * @returns This builder for chaining
   */
  fallback(action: CaseAction): RunbookBuilder {
    this.fallbackAction = action;
    return this;
  }

  /**
   * (v5) Configures the maximum number of iterations.
   *
   * @param max - Maximum iteration limit (default: 1000)
   * @returns This builder for chaining
   */
  maxIterations(max: number): RunbookBuilder {
    this.iterationsLimit = max;
    return this;
  }

  /**
   * (v5) Validates the runbook configuration.
   * Checks: duplicate step IDs, invalid goTo references,
   * cycles in the goTo graph, duplicate KnownCase IDs/priorities.
   *
   * @returns Array of validation errors (empty if valid)
   */
  validate(): ReadonlyArray<ValidationErrorEntry> {
    const errors: ValidationErrorEntry[] = [];

    // 1. Check metadata and fallback
    if (this.meta === undefined) {
      errors.push({
        code: 'MISSING_METADATA',
        message: 'Runbook metadata not set. Use .metadata() before .build().',
      });
    }

    if (this.fallbackAction === undefined) {
      errors.push({
        code: 'MISSING_FALLBACK',
        message: 'Fallback action not set. Use .fallback() before .build().',
      });
    }

    if (this.stepDescriptors.length === 0) {
      errors.push({
        code: 'EMPTY_STEPS',
        message: 'No steps defined. Add at least one step with .step().',
      });
    }

    // 2. Check duplicate step IDs
    const stepIds = new Set<string>();
    const orderedStepIds: string[] = [];
    for (const descriptor of this.stepDescriptors) {
      if (stepIds.has(descriptor.step.id)) {
        errors.push({
          code: 'DUPLICATE_STEP_ID',
          message: `Duplicate step ID: "${descriptor.step.id}". Each step must have a unique ID.`,
          stepId: descriptor.step.id,
        });
      }
      stepIds.add(descriptor.step.id);
      orderedStepIds.push(descriptor.step.id);
    }

    // 3. Check goTo references
    const goToRefs = this.collectGoToReferences();
    for (const ref of goToRefs) {
      if (!stepIds.has(ref.targetId)) {
        errors.push({
          code: 'INVALID_GOTO_REF',
          message: `Step "${ref.sourceId}" references goTo "${ref.targetId}" which does not exist.`,
          stepId: ref.sourceId,
        });
      }
    }

    // 4. Detect cycles in goTo graph
    const cycles = GoToGraphAnalyzer.detectCycles(orderedStepIds, goToRefs);
    for (const cycle of cycles) {
      const firstStepId = cycle[0];
      errors.push({
        code: 'LOOP_DETECTED',
        message: `Cycle detected in goTo graph: ${cycle.join(' -> ')}.`,
        ...(firstStepId !== undefined ? { stepId: firstStepId } : {}),
      });
    }

    // 5. Check duplicate KnownCase IDs
    const caseIds = new Set<string>();
    for (const knownCase of this.cases) {
      if (caseIds.has(knownCase.id)) {
        errors.push({
          code: 'DUPLICATE_CASE_ID',
          message: `Duplicate KnownCase ID: "${knownCase.id}". Each case must have a unique ID.`,
          caseId: knownCase.id,
        });
      }
      caseIds.add(knownCase.id);
    }

    // 6. Check duplicate KnownCase priorities
    const casePriorities = new Map<number, string>();
    for (const knownCase of this.cases) {
      const existingCaseId = casePriorities.get(knownCase.priority);
      if (existingCaseId !== undefined) {
        errors.push({
          code: 'DUPLICATE_CASE_PRIORITY',
          message: `KnownCase "${knownCase.id}" has the same priority (${knownCase.priority}) as "${existingCaseId}". Priorities must be unique.`,
          caseId: knownCase.id,
        });
      }
      casePriorities.set(knownCase.priority, knownCase.id);
    }

    return errors;
  }

  /**
   * Builds the runbook.
   * Automatically calls validate() and throws RunbookValidationError on failure.
   *
   * @returns The validated runbook ready for execution
   * @throws RunbookValidationError if validation fails
   */
  build(): Runbook {
    const validationErrors = this.validate();
    if (validationErrors.length > 0) {
      throw new RunbookValidationError(this.id, validationErrors);
    }

    if (this.meta === undefined || this.fallbackAction === undefined) {
      // This should never happen due to validation, but TypeScript needs this check
      throw new Error('Invalid runbook configuration: missing metadata or fallback action.');
    }

    const result: Runbook = {
      metadata: {
        id: this.id,
        ...this.meta, // Safe: validated in validate()
      },
      steps: [...this.stepDescriptors],
      knownCases: [...this.cases],
      fallbackAction: this.fallbackAction, // Safe: validated in validate()
    };

    if (this.iterationsLimit !== undefined) {
      return { ...result, maxIterations: this.iterationsLimit };
    }

    return result;
  }

  /**
   * Collects all goTo references from registered steps for static analysis.
   */
  private collectGoToReferences(): ReadonlyArray<GoToReference> {
    const refs: GoToReference[] = [];

    for (const descriptor of this.stepDescriptors) {
      const { step } = descriptor;

      if (isIfStepWithGoTo(step)) {
        if (step.thenGoTo !== undefined) {
          refs.push({ sourceId: step.id, targetId: step.thenGoTo });
        }
        if (step.elseGoTo !== undefined) {
          refs.push({ sourceId: step.id, targetId: step.elseGoTo });
        }
      }

      if (isSwitchStepWithGoTo(step)) {
        for (const [, targetId] of step.goToCases) {
          refs.push({ sourceId: step.id, targetId });
        }
      }
    }

    return refs;
  }
}
