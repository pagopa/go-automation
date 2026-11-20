import type { Runbook } from '../types/Runbook.js';
import type { RunbookExtensions } from '../types/RunbookExtensions.js';
import type { RunbookMetadata } from '../types/RunbookMetadata.js';
import type { Step } from '../types/Step.js';
import type { StepDescriptor } from '../types/StepDescriptor.js';
import type { KnownCase } from '../types/KnownCase.js';
import type { IfBranchConfig } from '../types/IfBranchConfig.js';
import type { SwitchBranchConfig } from '../types/SwitchBranchConfig.js';
import type { CaseAction } from '../types/CaseAction.js';
import type { ValidationErrorEntry } from '../validation/ValidationErrorEntry.js';
import type { GoToReference } from '../validation/GoToGraphAnalyzer.js';
import { RunbookValidationError } from '../validation/RunbookValidationError.js';
import { findUnwiredKnownCaseStepRef } from '../validation/findUnwiredKnownCaseStepRef.js';
import { validateErrorTree } from '../validation/validateErrorTree.js';
import { findUnanchoredRowPredicates } from '../validation/findUnanchoredRowPredicates.js';
import { levelStepIds } from '../tree/levelStepIds.js';
import type { ErrorTreeDefinition } from '../types/ErrorTreeDefinition.js';
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
 * Includes automatic validation before build.
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
 *   .step(new CloudWatchLogsQueryStep({ ... }))
 *   .step(new ExtractFieldStep({ ... }), { continueOnFailure: true })
 *   .knownCase({ ... })
 *   .fallback(logAction({ ... }))
 *   .build();
 * ```
 */
export class RunbookBuilder {
  private readonly id: string;
  private meta?: Omit<RunbookMetadata, 'id'>;
  /** Steps wired so far, in order; subclasses read them to validate their extensions. */
  protected readonly stepDescriptors: StepDescriptor[] = [];
  private readonly cases: KnownCase[] = [];
  private treeDefinition: ErrorTreeDefinition | undefined;
  private fallbackAction?: CaseAction;
  private iterationsLimit?: number;

  /**
   * @param id - Unique runbook identifier
   */
  protected constructor(id: string) {
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
  metadata(meta: Omit<RunbookMetadata, 'id'>): this {
    this.meta = meta;
    return this;
  }

  /**
   * Adds a step to the runbook.
   * Supports an optional second parameter for execution options.
   *
   * @param step - The step to add
   * @param options - Execution options (e.g. continueOnFailure)
   * @returns This builder for chaining
   */
  step(step: Step, options?: Omit<StepDescriptor, 'step'>): this {
    this.stepDescriptors.push(this.describeStep(step, options));
    return this;
  }

  /**
   * Builds the descriptor of a step. Copies only explicit keys, never a spread
   * of `options`: a pipeline hook also carries `at` and `step`. Toolkits
   * override it to add their descriptor fields.
   *
   * @param step - The step to describe
   * @param options - Execution options
   * @returns The descriptor stored in the runbook
   */
  protected describeStep(step: Step, options?: Omit<StepDescriptor, 'step'>): StepDescriptor {
    return {
      step,
      ...(options?.continueOnFailure === true ? { continueOnFailure: true } : {}),
      ...(options?.silent === true ? { silent: true } : {}),
    };
  }

  /**
   * Fields a toolkit adds to the built runbook, after the engine fields.
   *
   * @returns The extension fields; none in the engine
   */
  protected buildExtensions(): RunbookExtensions {
    return {};
  }

  /**
   * Validation of the fields a toolkit adds, appended to the engine checks.
   *
   * @returns Validation errors of the extensions; none in the engine
   */
  protected validateExtensions(): ReadonlyArray<ValidationErrorEntry> {
    return [];
  }

  /**
   * Ids of the steps wired so far — the source of truth for "does this runbook
   * contain step X", against a hand-maintained list that can drift from what
   * the builder actually assembled.
   *
   * @returns The wired step ids, in insertion order
   */
  wiredStepIds(): ReadonlySet<string> {
    return new Set([...this.stepDescriptors.map((descriptor) => descriptor.step.id), ...this.treeStepIds()]);
  }

  /**
   * Declares the levels the runbook investigates after the steps of the window, one node per error.
   *
   * @param tree - Root level and the levels it may descend to
   * @returns This builder for chaining
   */
  errorTree(tree: ErrorTreeDefinition): this {
    this.treeDefinition = tree;
    return this;
  }

  /** The step ids of the levels of the error tree. */
  private treeStepIds(): ReadonlyArray<string> {
    const tree = this.treeDefinition;
    return tree === undefined ? [] : [tree.root, ...tree.levels].flatMap((level) => levelStepIds(level));
  }

  /**
   * Adds an IfStep with inline sub-pipelines.
   * Alternative to ifCondition with goTo: the then/else pipelines
   * are executed inline in a child context.
   *
   * @param config - If branch configuration with sub-pipelines
   * @returns This builder for chaining
   */
  ifBranch(config: IfBranchConfig): this {
    const branchStep = new IfBranchStep(config);
    this.stepDescriptors.push({ step: branchStep });
    return this;
  }

  /**
   * Adds a SwitchStep with inline sub-pipelines.
   *
   * @param config - Switch branch configuration with sub-pipelines
   * @returns This builder for chaining
   */
  switchBranch(config: SwitchBranchConfig): this {
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
  knownCase(knownCase: KnownCase): this {
    this.cases.push(knownCase);
    return this;
  }

  /**
   * Sets the fallback action for when no known case matches.
   *
   * @param action - Fallback action
   * @returns This builder for chaining
   */
  fallback(action: CaseAction): this {
    this.fallbackAction = action;
    return this;
  }

  /**
   * Configures the maximum number of iterations.
   *
   * @param max - Maximum iteration limit (default: 1000)
   * @returns This builder for chaining
   */
  maxIterations(max: number): this {
    this.iterationsLimit = max;
    return this;
  }

  /**
   * Validates the runbook configuration.
   * Checks: duplicate step IDs, invalid goTo references,
   * cycles in the goTo graph, duplicate KnownCase IDs, unknown or cyclic `supersedes`.
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

    // 6. Check the cases each case supersedes
    errors.push(...validateSupersedes(this.cases));

    // 7. The levels of the error tree, and the cases that would need one row to satisfy a signature split over two
    if (this.treeDefinition !== undefined) {
      errors.push(
        ...validateErrorTree(this.treeDefinition, stepIds, (descriptors) => this.collectGoToReferences(descriptors)),
      );
      const levelReads = new Set(
        this.treeDefinition.levels.flatMap((level) => (level.read === undefined ? [] : [level.read.id])),
      );
      const unanchored = findUnanchoredRowPredicates(this.cases, levelReads);
      if (unanchored !== undefined) {
        errors.push({
          code: 'UNANCHORED_ROW_PREDICATES',
          message:
            `KnownCase "${unanchored.caseId}" reads the rows of "${unanchored.stepId}" twice in one all(...): ` +
            'anchor one predicate on the node and read the other from its siblings or its context.',
          caseId: unanchored.caseId,
        });
      }
    }

    // 8. Known cases must reference only steps the runbook wires (P10), the levels of the error tree included
    const unwired = findUnwiredKnownCaseStepRef(this.cases, this.wiredStepIds());
    if (unwired !== undefined) {
      errors.push({
        code: 'UNWIRED_CASE_STEP_REF',
        message: `KnownCase "${unwired.caseId}" references step "${unwired.stepId}" which is not wired in this runbook.`,
        caseId: unwired.caseId,
      });
    }

    errors.push(...this.validateExtensions());
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
      // After the engine fields, in the toolkit's order: the RTA fingerprint depends on key order.
      ...this.buildExtensions(),
    };

    const withTree = this.treeDefinition !== undefined ? { ...result, tree: this.treeDefinition } : result;
    return this.iterationsLimit !== undefined ? { ...withTree, maxIterations: this.iterationsLimit } : withTree;
  }

  /**
   * Collects all goTo references from registered steps for static analysis.
   */
  private collectGoToReferences(
    descriptors: ReadonlyArray<StepDescriptor> = this.stepDescriptors,
  ): ReadonlyArray<GoToReference> {
    const refs: GoToReference[] = [];

    for (const descriptor of descriptors) {
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

/**
 * Validates the `supersedes` of the known cases: every replaced case exists, no case replaces itself, and the
 * replacements form no cycle.
 *
 * Complexity: O(C + S) over cases and supersedes entries.
 *
 * @param cases - Known cases of the runbook
 * @returns The validation errors, empty when the replacements are sound
 */
function validateSupersedes(cases: ReadonlyArray<KnownCase>): ReadonlyArray<ValidationErrorEntry> {
  const errors: ValidationErrorEntry[] = [];
  const ids = new Set(cases.map((knownCase) => knownCase.id));
  const edges = new Map<string, ReadonlyArray<string>>();
  for (const knownCase of cases) {
    const replaced = knownCase.supersedes ?? [];
    edges.set(knownCase.id, replaced);
    for (const target of replaced) {
      if (target === knownCase.id) {
        errors.push({
          code: 'SUPERSEDES_CYCLE',
          message: `KnownCase "${knownCase.id}" supersedes itself.`,
          caseId: knownCase.id,
        });
      } else if (!ids.has(target)) {
        errors.push({
          code: 'UNKNOWN_SUPERSEDED_CASE',
          message: `KnownCase "${knownCase.id}" supersedes "${target}", which is not a case of this runbook.`,
          caseId: knownCase.id,
        });
      }
    }
  }

  const done = new Set<string>();
  const onPath = new Set<string>();
  const visit = (id: string): boolean => {
    if (onPath.has(id)) return true;
    if (done.has(id)) return false;
    onPath.add(id);
    const cyclic = (edges.get(id) ?? []).some((target) => target !== id && ids.has(target) && visit(target));
    onPath.delete(id);
    done.add(id);
    return cyclic;
  };
  for (const knownCase of cases) {
    if (!done.has(knownCase.id) && visit(knownCase.id)) {
      errors.push({
        code: 'SUPERSEDES_CYCLE',
        message: `The supersedes of KnownCase "${knownCase.id}" form a cycle.`,
        caseId: knownCase.id,
      });
    }
  }
  return errors;
}
