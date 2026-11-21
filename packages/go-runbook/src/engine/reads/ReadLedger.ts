import type { CoverageEntry } from '../types/CoverageEntry.js';
import type { CoverageReason } from '../types/CoverageReason.js';
import type { EvidenceIdentifierKind } from '../types/EvidenceIdentifierKind.js';
import type { ReadIdentifier } from '../types/ReadIdentifier.js';
import type { ReadState } from '../types/ReadState.js';
import type { RunbookReads } from '../types/RunbookReads.js';
import type { StepCoverage } from '../types/StepCoverage.js';
import type { TreeLevelReadResult } from '../types/TreeLevelReadResult.js';
import type { ReadBatch } from './ReadBatch.js';
import type { ReadDescent } from './ReadDescent.js';
import type { ReadScope } from './ReadScope.js';
import { canonicalReadIdentifier } from './canonicalReadIdentifier.js';

/** Longest coverage detail recorded for a gap. */
const MAX_COVERAGE_DETAIL = 200;

/** Severity of the read states: a read with several gaps has the state of the most severe. */
const SEVERITY: Readonly<Record<ReadState, number>> = {
  queried: 0,
  saturated: 1,
  unavailable: 2,
  skipped: 3,
  cycle: 4,
};

/** The kinds of identifier a gap may name. */
const IDENTIFIER_KINDS: ReadonlySet<string> = new Set<EvidenceIdentifierKind>([
  'traceId',
  'requestId',
  'fallbackUuid',
  'cid',
]);

/** A gap attributed to a scope or to a batch: its state and, when it names some, the keys of its identifiers. */
interface Gap {
  readonly state: ReadState;
  readonly identifiers?: ReadonlySet<string>;
}

/** A physical read of a level: failed as a whole, or with its gaps. */
interface BatchRecord {
  readonly failed: boolean;
  readonly gaps: ReadonlyArray<Gap>;
}

/**
 * The gaps of the reads of one execution, and the answers about them: the state of the read of a step, with or
 * without an identifier, of a descent, of a level for a node, of a node and of the window.
 *
 * A gap is attributed to every scope that declares or reuses it: two nodes that reuse the same shared read are both
 * incomplete. The entries it exposes are unique by step and entry object: the same entry of the same step, reused by
 * several scopes, is reported once, while two reads always give two entries. A scope sees its own gaps and those of
 * the scopes it descends from. The gaps of a batch of a level concern the descents it read, never a scope.
 *
 * Per-execution: create one for every run.
 *
 * @example
 * ```typescript
 * const ledger = new ReadLedger();
 * ledger.recordStep(ledger.window, 'query-logs', [{ complete: false, reason: 'saturated' }]);
 * ledger.view(ledger.window).stateOf('query-logs'); // 'saturated'
 * ```
 */
export class ReadLedger {
  private readonly scopeGaps = new Map<ReadScope, Map<string, Gap[]>>();
  private readonly descentStates = new Map<ReadDescent, ReadState>();
  private readonly descentsByScope = new Map<ReadScope, ReadDescent[]>();
  private readonly batches = new Map<ReadBatch, BatchRecord>();
  private readonly exposed: CoverageEntry[] = [];
  private readonly exposedSteps = new Map<StepCoverage, Set<string>>();
  private readonly skippedTargets = new Set<string>();
  readonly window: ReadScope = this.newScope(undefined);

  /**
   * Creates a scope that sees the gaps of its parent: an error node, or a routing of a node.
   *
   * @param parent - Scope the new one descends from
   * @returns The scope
   */
  createScope(parent: ReadScope): ReadScope {
    return this.newScope(parent);
  }

  /**
   * Records the gaps a step declared in a scope; the complete entries are ignored.
   *
   * An identifier that is not valid for its kind is not recorded: the gap then concerns the whole read.
   *
   * @param scope - Scope of the step
   * @param stepId - Step that declared the gaps
   * @param coverage - Coverage declared by the step
   */
  recordStep(scope: ReadScope, stepId: string, coverage: ReadonlyArray<StepCoverage>): void {
    for (const declared of coverage) {
      if (declared.complete) continue;
      const identifiers = validIdentifiers(declared.identifiers);
      this.attribute(scope, stepId, gapOf(declared.reason, identifiers));
      const steps = this.exposedSteps.get(declared) ?? new Set<string>();
      if (steps.has(stepId)) continue;
      steps.add(stepId);
      this.exposedSteps.set(declared, steps);
      this.exposed.push(entryOf(stepId, declared, declared.detail, identifiers));
    }
  }

  /**
   * Records the failed read of a step: `unavailable` for the whole read, with a bounded detail.
   *
   * @param scope - Scope of the step
   * @param stepId - Step that failed
   * @param error - Error message of the failure
   */
  recordFailure(scope: ReadScope, stepId: string, error: string | undefined): void {
    this.attribute(scope, stepId, { state: 'unavailable' });
    this.exposed.push(failedEntry(stepId, error));
  }

  /**
   * Records a physical read of a level for a batch of identifiers. Its gaps concern the descents that read it.
   *
   * @param stepId - Id of the reader
   * @param identifiers - Identifiers of the batch
   * @param result - Result of the read
   * @returns The batch, to attach to the descents it read
   */
  recordBatch(stepId: string, identifiers: ReadonlyArray<ReadIdentifier>, result: TreeLevelReadResult): ReadBatch {
    const batch: ReadBatch = { stepId };
    const label = `${String(identifiers.length)} identificatori`;
    if (!result.success) {
      this.batches.set(batch, { failed: true, gaps: [] });
      this.exposed.push(failedEntry(stepId, `${label}: ${result.error ?? 'lettura fallita'}`));
      return batch;
    }
    const gaps: Gap[] = [];
    for (const declared of result.coverage ?? []) {
      if (declared.complete) continue;
      const valid = validIdentifiers(declared.identifiers);
      gaps.push(gapOf(declared.reason, valid));
      const detail = declared.detail === undefined ? label : `${label}: ${declared.detail}`;
      this.exposed.push(entryOf(stepId, declared, detail, valid));
    }
    this.batches.set(batch, { failed: false, gaps });
    return batch;
  }

  /**
   * Opens a descent of a scope towards a level: it has no state until it is read, skipped or closed.
   *
   * @param scope - Scope of the node that descends
   * @param target - Level of the descent
   * @returns The descent
   */
  openDescent(scope: ReadScope, target: string): ReadDescent {
    const descent: ReadDescent = { scope, target };
    const descents = this.descentsByScope.get(scope) ?? [];
    descents.push(descent);
    this.descentsByScope.set(scope, descents);
    return descent;
  }

  /**
   * Records an attempt of a descent: how the batch that read it ended for its identifier.
   *
   * @param descent - Descent read
   * @param batch - Batch that read it
   * @param identifier - Identifier of the descent in the batch
   */
  attemptDescent(descent: ReadDescent, batch: ReadBatch, identifier: ReadIdentifier): void {
    const record = this.batches.get(batch);
    if (record === undefined || record.failed) {
      this.markDescent(descent, 'unavailable');
      return;
    }
    const key = keyOf(canonicalReadIdentifier(identifier) ?? identifier);
    this.markDescent(descent, worstOf(record.gaps.filter((gap) => appliesTo(gap, key))));
  }

  /**
   * Records how a descent ended without a batch (a cycle, an unread routing); the worst state of a descent wins.
   *
   * @param descent - Descent
   * @param state - State of the descent
   */
  markDescent(descent: ReadDescent, state: ReadState): void {
    const previous = this.descentStates.get(descent);
    this.descentStates.set(descent, previous === undefined ? state : worse(previous, state));
  }

  /**
   * Records a descent without reader or identifier: `skipped`, with one coverage entry per level.
   *
   * @param descent - Descent
   * @param readStepId - Id of the reader of the level, if any
   */
  skipDescent(descent: ReadDescent, readStepId: string | undefined): void {
    this.markDescent(descent, 'skipped');
    if (this.skippedTargets.has(descent.target)) return;
    this.skippedTargets.add(descent.target);
    this.exposed.push({
      stepId: readStepId ?? descent.target,
      source: descent.target,
      complete: false,
      reason: 'skipped',
      detail: 'identificatore mancante per la discesa',
    });
  }

  /**
   * The state of a descent: the worst of its attempts, nothing before it is read.
   *
   * @param descent - Descent
   * @returns The state, or nothing
   */
  descentState(descent: ReadDescent): ReadState | undefined {
    return this.descentStates.get(descent);
  }

  /**
   * The state of a level for a node: the worst of the descents of its scope towards the level read so far.
   *
   * @param scope - Scope of the node
   * @param target - Level
   * @returns The state; `queried` when no descent was read
   */
  levelState(scope: ReadScope, target: string): ReadState {
    let state: ReadState = 'queried';
    for (const descent of this.descentsByScope.get(scope) ?? []) {
      const descentState = this.descentStates.get(descent);
      if (descent.target === target && descentState !== undefined) state = worse(state, descentState);
    }
    return state;
  }

  /**
   * Whether a scope recorded a gap of its own.
   *
   * @param scope - Scope
   * @returns `true` when one of its steps declared a gap or failed
   */
  hasOwnGaps(scope: ReadScope): boolean {
    for (const gaps of this.scopeGaps.get(scope)?.values() ?? []) if (gaps.length > 0) return true;
    return false;
  }

  /**
   * Whether the evidence of a node is incomplete: a gap of its own, or a gap of a scope it descends from that names
   * an identifier of its correlation.
   *
   * @param scope - Scope of the node
   * @param correlation - Correlation of the node
   * @returns `true` when the node is incomplete
   */
  isNodeIncomplete(scope: ReadScope, correlation: Readonly<Record<string, string>>): boolean {
    if (this.hasOwnGaps(scope)) return true;
    const keys = new Set<string>();
    for (const [kind, value] of Object.entries(correlation)) {
      if (!isIdentifierKind(kind)) continue;
      const identifier = canonicalReadIdentifier({ kind, value });
      if (identifier !== undefined) keys.add(keyOf(identifier));
    }
    if (keys.size === 0) return false;
    for (let current = scope.parent; current !== undefined; current = current.parent) {
      for (const gaps of this.scopeGaps.get(current)?.values() ?? []) {
        for (const gap of gaps) {
          if (gap.identifiers !== undefined && [...keys].some((key) => gap.identifiers?.has(key) === true)) return true;
        }
      }
    }
    return false;
  }

  /**
   * Whether the window has a gap of the whole read: every chain is then incomplete.
   *
   * @returns `true` when a step of the window declared a gap without identifiers, or failed
   */
  windowIncomplete(): boolean {
    for (const gaps of this.scopeGaps.get(this.window)?.values() ?? []) {
      if (gaps.some((gap) => gap.identifiers === undefined)) return true;
    }
    return false;
  }

  /**
   * The read-only view of a scope, for the context of its steps.
   *
   * @param scope - Scope
   * @returns The view
   */
  view(scope: ReadScope): RunbookReads {
    return {
      stateOf: (stepId, identifier) => this.stateOf(scope, stepId, identifier),
      isComplete: (stepId) => this.stateOf(scope, stepId, undefined) === 'queried',
      hasGapFor: (stepId, identifier) => this.hasGapFor(scope, stepId, identifier),
    };
  }

  /**
   * The coverage entries of the execution, in the order they were recorded, each once.
   *
   * @returns The entries
   */
  entries(): ReadonlyArray<CoverageEntry> {
    return this.exposed;
  }

  private newScope(parent: ReadScope | undefined): ReadScope {
    const scope: ReadScope = parent === undefined ? {} : { parent };
    this.scopeGaps.set(scope, new Map());
    return scope;
  }

  private attribute(scope: ReadScope, stepId: string, gap: Gap): void {
    const byStep = this.scopeGaps.get(scope) ?? new Map<string, Gap[]>();
    const gaps = byStep.get(stepId) ?? [];
    gaps.push(gap);
    byStep.set(stepId, gaps);
    this.scopeGaps.set(scope, byStep);
  }

  private stateOf(scope: ReadScope, stepId: string, identifier: ReadIdentifier | undefined): ReadState {
    const key = identifier === undefined ? undefined : keyOf(canonicalReadIdentifier(identifier) ?? identifier);
    let state: ReadState = 'queried';
    for (let current: ReadScope | undefined = scope; current !== undefined; current = current.parent) {
      for (const gap of this.scopeGaps.get(current)?.get(stepId) ?? []) {
        if (key === undefined || appliesTo(gap, key)) state = worse(state, gap.state);
      }
    }
    return state;
  }

  private hasGapFor(scope: ReadScope, stepId: string, identifier: ReadIdentifier): boolean {
    const key = keyOf(canonicalReadIdentifier(identifier) ?? identifier);
    for (let current: ReadScope | undefined = scope; current !== undefined; current = current.parent) {
      for (const gap of this.scopeGaps.get(current)?.get(stepId) ?? []) {
        if (gap.identifiers?.has(key) === true) return true;
      }
    }
    return false;
  }
}

/** The state of a gap of the given reason. */
function stateOfReason(reason: CoverageReason | undefined): ReadState {
  switch (reason) {
    case 'saturated':
      return 'saturated';
    case 'skipped':
      return 'skipped';
    case 'unavailable':
    case 'manual':
    case undefined:
      return 'unavailable';
    default: {
      const exhaustive: never = reason;
      throw new Error(`Unknown coverage reason: ${String(exhaustive)}`);
    }
  }
}

/** The gap of a reason, for the identifiers it names. */
function gapOf(reason: CoverageReason | undefined, identifiers: ReadonlyArray<ReadIdentifier> | undefined): Gap {
  return {
    state: stateOfReason(reason),
    ...(identifiers !== undefined ? { identifiers: new Set(identifiers.map(keyOf)) } : {}),
  };
}

/** The identifiers of a gap in their canonical form; nothing for a gap of the whole read, or with an invalid one. */
function validIdentifiers(
  identifiers: ReadonlyArray<ReadIdentifier> | undefined,
): ReadonlyArray<ReadIdentifier> | undefined {
  if (identifiers === undefined || identifiers.length === 0) return undefined;
  const valid: ReadIdentifier[] = [];
  for (const identifier of identifiers) {
    const canonical = canonicalReadIdentifier(identifier);
    if (canonical === undefined) return undefined;
    valid.push(canonical);
  }
  return valid;
}

/** The coverage entry of a declared gap, with its bounded detail and its valid identifiers. */
function entryOf(
  stepId: string,
  declared: StepCoverage,
  detail: string | undefined,
  identifiers: ReadonlyArray<ReadIdentifier> | undefined,
): CoverageEntry {
  return {
    stepId,
    ...(declared.source !== undefined ? { source: declared.source } : {}),
    complete: false,
    ...(declared.reason !== undefined ? { reason: declared.reason } : {}),
    ...(detail !== undefined ? { detail: boundedDetail(detail) } : {}),
    ...(identifiers !== undefined ? { identifiers } : {}),
  };
}

/** The coverage entry of a failed read. */
function failedEntry(stepId: string, error: string | undefined): CoverageEntry {
  return {
    stepId,
    complete: false,
    reason: 'unavailable',
    ...(error !== undefined ? { detail: boundedDetail(error) } : {}),
  };
}

/** Whether a gap concerns an identifier: a gap of the whole read concerns all of them. */
function appliesTo(gap: Gap, key: string): boolean {
  return gap.identifiers === undefined || gap.identifiers.has(key);
}

/** The most severe state of some gaps; `queried` without gaps. */
function worstOf(gaps: ReadonlyArray<Gap>): ReadState {
  let state: ReadState = 'queried';
  for (const gap of gaps) state = worse(state, gap.state);
  return state;
}

/** The more severe of two states. */
function worse(a: ReadState, b: ReadState): ReadState {
  return SEVERITY[a] >= SEVERITY[b] ? a : b;
}

/** The key of an identifier. */
function keyOf(identifier: ReadIdentifier): string {
  return `${identifier.kind}:${identifier.value}`;
}

/** Whether a correlation key is a kind of identifier. */
function isIdentifierKind(kind: string): kind is EvidenceIdentifierKind {
  return IDENTIFIER_KINDS.has(kind);
}

/**
 * A coverage detail within its bound, cut at a word boundary: a name cut in half (a profile, an account) would no
 * longer match the whole-token scrub applied where the output leaves the host.
 */
function boundedDetail(text: string): string {
  if (text.length <= MAX_COVERAGE_DETAIL) return text;
  const cut = text.slice(0, MAX_COVERAGE_DETAIL);
  const boundary = cut.search(/\s\S*$/u);
  return boundary > 0 ? cut.slice(0, boundary) : '';
}
