import type { AlarmRunbookContext } from '../output/AlarmRunbookContext.js';
import type { AlarmRunbookAnchors } from './AlarmRunbookAnchors.js';
import type { DefaultFallbackFn } from './DefaultFallbackFn.js';

/** What a toolkit must supply on top of its config to close a runbook. */
export interface FinishAlarmRunbookOptions<TAnchor extends string> {
  /**
   * Builds the fallback used when the config declares none. A function, not a
   * value, so a config that brings its own `fallbackAction` never pays for
   * building the default — and never inherits a failure from it.
   */
  readonly defaultFallback: DefaultFallbackFn;
  /** Structured context describing the analysed component. */
  readonly runbookContext: AlarmRunbookContext;
  /**
   * Name of the component under analysis, recorded as the draft's PRIMARY
   * resource. `type` stays undeclared until the coverage check confirms
   * the censused ResourceType name — a wrong type would block the apply, while
   * omitting it never does.
   */
  readonly primaryResource: string;
  readonly primaryResourceType?: string;
  /**
   * Default documental runbook name, overridden by the one in
   * `config.analysisDefaults` when the runbook declares its own.
   */
  readonly defaultRunbookName?: string;
  /** Hook wiring; omit for a pipeline that declares no anchors. */
  readonly anchors?: AlarmRunbookAnchors<TAnchor>;
  /** Factory name reported when a known error points at a step nobody wired. */
  readonly builderName: string;
}
