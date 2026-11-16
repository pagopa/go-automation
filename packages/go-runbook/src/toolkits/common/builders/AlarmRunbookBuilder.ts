import { omitUndefined } from '@pagopa/go-common/utils';

import { RunbookBuilder } from '../../../engine/builders/RunbookBuilder.js';
import type { RunbookExtensions } from '../../../engine/types/RunbookExtensions.js';
import type { Step } from '../../../engine/types/Step.js';
import type { StepDescriptor } from '../../../engine/types/StepDescriptor.js';
import type { ValidationErrorEntry } from '../../../engine/validation/ValidationErrorEntry.js';
import type { RunbookAnalysisDefaults } from '../analysis/RunbookAnalysisDefaults.js';
import type { AlarmRunbookContext } from '../output/AlarmRunbookContext.js';
import type { RunbookOutputDefinition } from '../output/RunbookOutputDefinition.js';
import { validateOutputDefinitions } from '../output/validateOutputDefinitions.js';
import type { CloudExecutionPolicy } from '../policies/CloudExecutionPolicy.js';
import type { OccurrenceTimeWindow } from '../time/occurrence/OccurrenceTimeWindow.js';

/**
 * Builder of the alarm runbooks: the engine builder plus the operational
 * fields (occurrence window, cloud policy, analysis defaults, runbook context,
 * output) and the step evidence (EVO-RBREORG-OPUS-01 §7.1.3 E). It writes them
 * through the template methods of {@link RunbookBuilder}, so the built runbook
 * keeps the same keys, in the same order, as before the split.
 *
 * @example
 * ```typescript
 * const runbook = AlarmRunbookBuilder.create('pn-foo-Alarm')
 *   .metadata({ name: 'Foo', description: '', version: '1.0.0', type: 'alarm-resolution', team: 'GO', tags: [] })
 *   .step(new CloudWatchLogsQueryStep({ ... }), { evidence: [...] })
 *   .cloudExecutionPolicy({ sideEffects: 'NONE' })
 *   .fallback(logAction({ ... }))
 *   .build();
 * ```
 */
export class AlarmRunbookBuilder extends RunbookBuilder {
  private structuredContext?: AlarmRunbookContext;
  private outputDefinition?: RunbookOutputDefinition;
  private cloudPolicy?: CloudExecutionPolicy;
  private analysisDefaultRefs?: RunbookAnalysisDefaults;
  private occurrenceWindow?: OccurrenceTimeWindow;

  /**
   * Creates a new alarm runbook builder.
   *
   * @param id - Unique runbook identifier
   * @returns New builder instance
   */
  static override create(id: string): AlarmRunbookBuilder {
    return new AlarmRunbookBuilder(id);
  }

  /**
   * Configures the diagnostic padding around alarm occurrences.
   *
   * @param window - Independent non-negative padding before and after the occurrence
   * @returns This builder for chaining
   */
  occurrenceTimeWindow(window: OccurrenceTimeWindow): this {
    this.occurrenceWindow = { ...window };
    return this;
  }

  /**
   * Sets the analysis references shared by every known case.
   *
   * Declaring them marks the runbook as annotated: `validateForCloud` then
   * requires the `analysis` directives on each of its known cases.
   *
   * @param defaults - References merged into every emitted analysis draft
   * @returns This builder for chaining
   */
  analysisDefaults(defaults: RunbookAnalysisDefaults): this {
    this.analysisDefaultRefs = defaults;
    return this;
  }

  /**
   * Attaches the structured, family-specific context to the runbook.
   *
   * @param value - Context read by the output builders of the families
   * @returns This builder for chaining
   */
  runbookContext(value: AlarmRunbookContext): this {
    this.structuredContext = value;
    return this;
  }

  /**
   * Declares diagnostics exported by the shared output builder.
   *
   * @param definition - Output definition
   * @returns This builder for chaining
   */
  output(definition: RunbookOutputDefinition): this {
    this.outputDefinition = definition;
    return this;
  }

  /**
   * Declares the constraints required to execute this runbook in cloud workers.
   *
   * @param policy - Cloud execution policy
   * @returns This builder for chaining
   */
  cloudExecutionPolicy(policy: CloudExecutionPolicy): this {
    this.cloudPolicy = policy;
    return this;
  }

  /**
   * Adds the step evidence after `silent`, where the builder put it before the split.
   *
   * @param step - The step to describe
   * @param options - Execution options and evidence
   * @returns The descriptor stored in the runbook
   */
  protected override describeStep(step: Step, options?: Omit<StepDescriptor, 'step'>): StepDescriptor {
    const descriptor = super.describeStep(step, options);
    return options?.evidence === undefined ? descriptor : { ...descriptor, evidence: options.evidence };
  }

  /**
   * Operational fields of the built runbook, in their historical order.
   *
   * @returns The fields that were set
   */
  protected override buildExtensions(): RunbookExtensions {
    // Copied, not aliased: the built runbook must not share the builder's own window object.
    const occurrenceTimeWindow = this.occurrenceWindow !== undefined ? { ...this.occurrenceWindow } : undefined;
    return omitUndefined({
      occurrenceTimeWindow,
      runbookContext: this.structuredContext,
      output: this.outputDefinition,
      cloudExecutionPolicy: this.cloudPolicy,
      analysisDefaults: this.analysisDefaultRefs,
    });
  }

  /**
   * Validates the occurrence window and the output definition.
   *
   * @returns Validation errors of the operational fields
   */
  protected override validateExtensions(): ReadonlyArray<ValidationErrorEntry> {
    const errors: ValidationErrorEntry[] = [];
    if (this.occurrenceWindow !== undefined) {
      for (const [field, value] of Object.entries(this.occurrenceWindow)) {
        if (!Number.isFinite(value) || value < 0) {
          errors.push({
            code: 'INVALID_OCCURRENCE_TIME_WINDOW',
            message: `Invalid occurrenceTimeWindow.${field}: ${String(value)}. Expected a finite, non-negative number.`,
          });
        }
      }
    }
    errors.push(...validateOutputDefinitions(this.stepDescriptors, this.outputDefinition));
    return errors;
  }
}
