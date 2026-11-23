import { omitUndefined } from '@pagopa/go-common/utils';
import type { ErrorTreeExecutorDeps } from '../types/ErrorTreeExecutorDeps.js';
import type { ErrorTreeRun } from '../types/ErrorTreeRun.js';
import type { DescendRequest } from '../types/DescendRequest.js';
import type { ErrorNodeSpec } from '../types/ErrorNodeSpec.js';
import type { ErrorTreeDefinition } from '../types/ErrorTreeDefinition.js';
import type { KnownCase } from '../types/KnownCase.js';
import type { RunbookContext } from '../types/RunbookContext.js';
import type { TreeLevel } from '../types/TreeLevel.js';
import type { TreeLevelReader } from '../types/TreeLevelReader.js';
import type { TreeLevelReadResult } from '../types/TreeLevelReadResult.js';
import type { EvidenceIdentifier } from '../types/EvidenceIdentifier.js';
import type { EvidenceIdentifierKind } from '../types/EvidenceIdentifierKind.js';
import { identifierKey } from '../reads/identifierKey.js';

import { throwIfRunbookAborted } from '../context/throwIfRunbookAborted.js';
import { failedResultUnlessAborted } from '../context/failedResultUnlessAborted.js';
import { createNodeContext } from './createNodeContext.js';
import { levelStepIds } from './levelStepIds.js';
import type { PendingDescent } from './PendingDescent.js';
import type { ReadOutcome } from './ReadOutcome.js';
import type { WorkDescent } from './WorkDescent.js';
import type { WorkNode } from './WorkNode.js';
import { BRANCH_OUTCOME_VAR } from './descentVarNames.js';
import type { BranchOutcome } from '../types/BranchOutcome.js';
import type { ErrorTreeNode } from '../types/ErrorTreeNode.js';
import type { ReadLedger } from '../reads/ReadLedger.js';
import type { ReadScope } from '../reads/ReadScope.js';
import { exclusionVar } from './descentVarNames.js';
import { logCountVar } from './descentVarNames.js';
import { lookupStateVar } from './descentVarNames.js';
import { sharedConditionEvaluator } from '../core/ConditionEvaluator.js';

/** Identifiers per grouped read when the level does not say. */
const DEFAULT_BATCH_SIZE = 50;

/** Deepest node: a descent below it is closed as a cycle. */
const MAX_DEPTH = 32;

/**
 * Investigates the errors of a runbook level by level.
 *
 * The root level enumerates the errors of the window; every node runs the steps of its level in an isolated context
 * and may ask to descend. The descents of all the nodes are grouped by level and identifier kind, and each group is
 * one read per batch, whose rows are divided among the parents by exact identifier. Every parent gets, even without
 * rows, how its read ended: the read ledger keeps the state of every descent and of every level for a node. Once the
 * tree is complete, the nodes are evaluated from the deepest: the after-descent steps, the outcome of the branch
 * below, then the known cases of the level.
 *
 * Per-execution: create one for every run.
 *
 * @example
 * ```typescript
 * const run = await new ErrorTreeExecutor(tree, caseLevels, knownCases, deps).run(windowContext);
 * ```
 */
export class ErrorTreeExecutor {
  private readonly levels: ReadonlyMap<string, TreeLevel>;
  private readonly stepIdsOfLevel: ReadonlyMap<TreeLevel, ReadonlyArray<string>>;
  private readonly nodes: WorkNode[] = [];
  private readonly nodeIds = new Set<string>();

  /**
   * @param tree - Levels of the runbook
   * @param caseLevels - Levels each case is evaluated on, by case id
   * @param knownCases - Cases of the runbook, in declaration order
   * @param deps - Collaborators provided by the engine
   */
  constructor(
    private readonly tree: ErrorTreeDefinition,
    private readonly caseLevels: ReadonlyMap<string, ReadonlySet<string>>,
    private readonly knownCases: ReadonlyArray<KnownCase>,
    private readonly deps: ErrorTreeExecutorDeps,
  ) {
    this.levels = new Map(tree.levels.map((level) => [level.target, level]));
    this.stepIdsOfLevel = new Map([tree.root, ...tree.levels].map((level) => [level, levelStepIds(level)]));
  }

  /**
   * Builds and evaluates the tree.
   *
   * @param window - Context reached by the steps of the window
   * @returns The nodes, their contexts and the errors the root level observed
   * @throws DOMException `AbortError` when the execution is aborted
   */
  async run(window: RunbookContext): Promise<ErrorTreeRun> {
    const root = this.tree.root;
    const enumerated = root.enumerate({ context: window, rows: [] });
    for (const spec of enumerated.nodes) {
      throwIfRunbookAborted(window);
      await this.createNode(spec, root, window, undefined, undefined);
    }

    let pending = this.pendingDescents();
    while (pending.length > 0) {
      await this.descend(pending, window);
      pending = this.pendingDescents();
    }

    await this.evaluate();

    return {
      nodes: this.nodes.map((node) => this.toTreeNode(node)),
      contexts: new Map(this.nodes.map((node) => [node.id, node.context])),
      ...(enumerated.observedErrors !== undefined
        ? { observedErrors: { ...enumerated.observedErrors, examined: enumerated.nodes.length } }
        : {}),
    };
  }

  /** Creates a node and runs the steps of its level, which decide its descents. */
  private async createNode(
    spec: ErrorNodeSpec,
    level: TreeLevel,
    base: RunbookContext,
    parent: WorkNode | undefined,
    arrivedBy: WorkDescent | undefined,
  ): Promise<WorkNode> {
    const scope = this.ledger.createScope(parent?.scope ?? this.ledger.window);
    const context: RunbookContext = {
      ...createNodeContext(base, spec, parent === undefined ? [] : this.stepIdsOf(parent.level)),
      reads: this.ledger.view(scope),
    };
    const run =
      level.perNode !== undefined && level.perNode.length > 0
        ? await this.deps.runSteps(level.perNode, context, scope)
        : { context, descends: [] };
    const ownRows = spec.rowIdentities ?? rowIdentities(spec, level);
    const id = this.uniqueId(
      parent === undefined ? `${level.target}:${spec.key}` : `${parent.id}>${level.target}:${spec.key}`,
    );
    const node: WorkNode = {
      id,
      ...(parent !== undefined ? { parentId: parent.id } : {}),
      depth: parent === undefined ? 0 : parent.depth + 1,
      level,
      spec,
      errorKey: ownRows.length > 0 ? [level.target, ...ownRows].join('\n') : id,
      scope,
      ...(arrivedBy?.request.via !== undefined ? { via: arrivedBy.request.via } : {}),
      context: run.context,
      ...(run.failure !== undefined ? { failure: run.failure } : {}),
      // A failed node does not descend: its chain stops there, with what it collected.
      descents: run.failure !== undefined ? [] : this.uniqueDescents(run.descends, scope),
      pathKeys: new Set([
        ...(parent?.pathKeys ?? []),
        ...(arrivedBy?.through ?? []),
        ...(arrivedBy !== undefined ? [descentKey(arrivedBy.request)] : []),
      ]),
      pathRows: new Set([...(parent?.pathRows ?? []), ...ownRows]),
      detections: [],
      branchOutcome: 'undiagnosed',
      reads: new Map(),
    };
    this.nodes.push(node);
    return node;
  }

  /** The step ids a level owns, computed once per level. */
  private stepIdsOf(level: TreeLevel): ReadonlyArray<string> {
    return this.stepIdsOfLevel.get(level) ?? levelStepIds(level);
  }

  /** Every descent requested and not yet read. */
  private pendingDescents(): ReadonlyArray<{ readonly node: WorkNode; readonly descent: WorkDescent }> {
    const pending: { readonly node: WorkNode; readonly descent: WorkDescent }[] = [];
    for (const node of this.nodes) {
      for (const descent of node.descents) {
        if (this.ledger.descentState(descent.read) === undefined) pending.push({ node, descent });
      }
    }
    return pending;
  }

  /** Reads the pending descents, grouped by level and identifier kind, and creates the children. */
  private async descend(
    pending: ReadonlyArray<{ readonly node: WorkNode; readonly descent: WorkDescent }>,
    window: RunbookContext,
  ): Promise<void> {
    const toRead: PendingDescent[] = [];
    for (const { node, descent } of pending) {
      const level = this.levels.get(descent.request.target);
      if (descent.request.identifier.value.trim() === '' || level?.read === undefined) {
        this.ledger.skipDescent(descent.read, level?.read?.id);
        if (level !== undefined) this.publish(node, level, []);
        continue;
      }
      // A route back to a service it already traversed is a cycle too.
      const loops = descent.through?.has(descentKey(descent.request)) === true;
      if (loops || node.pathKeys.has(descentKey(descent.request)) || node.depth + 1 >= MAX_DEPTH) {
        this.ledger.markDescent(descent.read, 'cycle');
        this.publish(node, level, []);
        continue;
      }
      toRead.push({ node, descent, level, reader: level.read });
    }

    const first = await this.readGroups(
      toRead.map((entry) => ({ entry, identifier: entry.descent.request.identifier })),
      window,
    );

    // A second attempt at the same level, with a better identifier the first one found: the rows are merged.
    const retries = new Map<PendingDescent, EvidenceIdentifier>();
    for (const entry of toRead) {
      const outcome = first.get(entry);
      const next =
        outcome === undefined ? undefined : entry.level.secondAttempt?.(outcome.rows, entry.descent.request.identifier);
      if (next === undefined || next.value.trim() === '' || next.value === entry.descent.request.identifier.value)
        continue;
      retries.set(entry, next);
    }
    const second = await this.readGroups(
      [...retries].map(([entry, identifier]) => ({ entry, identifier })),
      window,
    );

    for (const entry of toRead) {
      throwIfRunbookAborted(window);
      const outcome = first.get(entry);
      const retry = second.get(entry);
      // A descent no batch answered for was not read.
      if (outcome === undefined) this.ledger.markDescent(entry.descent.read, 'unavailable');
      const rows =
        retry === undefined ? (outcome?.rows ?? []) : mergeRows(outcome?.rows ?? [], retry.rows, entry.level);
      await this.attach(entry, rows, retry === undefined ? undefined : retries.get(entry));
    }
  }

  /** Reads the identifiers of the entries, one read per batch of the same level and kind. */
  private async readGroups(
    requests: ReadonlyArray<{ readonly entry: PendingDescent; readonly identifier: EvidenceIdentifier }>,
    window: RunbookContext,
  ): Promise<ReadonlyMap<PendingDescent, ReadOutcome>> {
    const groups = new Map<
      string,
      {
        readonly level: TreeLevel;
        readonly reader: TreeLevelReader;
        readonly values: Set<string>;
        readonly kind: EvidenceIdentifierKind;
      }
    >();
    for (const { entry, identifier } of requests) {
      const key = `${entry.level.target}|${identifier.kind}`;
      const group = groups.get(key) ?? {
        level: entry.level,
        reader: entry.reader,
        values: new Set<string>(),
        kind: identifier.kind,
      };
      group.values.add(identifier.value);
      groups.set(key, group);
    }

    const byIdentifier = new Map<string, ReadOutcome>();
    for (const group of groups.values()) {
      const identifiers = [...group.values].map((value): EvidenceIdentifier => ({ kind: group.kind, value }));
      for (const batch of this.batchesOf(group.reader, group.level, identifiers)) {
        throwIfRunbookAborted(window);
        const startedAtMs = Date.now();
        let result: TreeLevelReadResult;
        try {
          const { attribute, rowIdentity } = group.level;
          result = await group.reader.read(window, batch, omitUndefined({ attribute, rowIdentity }));
        } catch (error: unknown) {
          result = { ...failedResultUnlessAborted(window, error), rows: [] };
        }
        this.deps.recordRead(group.reader, batch, result, startedAtMs);
        const read = this.ledger.recordBatch(group.reader.id, batch, result);
        const attribute = group.level.attribute;
        for (const identifier of batch) {
          // A read for one identifier returns only its rows by construction; a grouped one is divided by attribution.
          const rows =
            batch.length === 1 ? result.rows : attribute === undefined ? [] : result.rows.filter(attribute(identifier));
          byIdentifier.set(`${group.level.target}|${identifierKey(identifier)}`, { rows, batch: read });
        }
      }
    }

    const outcomes = new Map<PendingDescent, ReadOutcome>();
    for (const { entry, identifier } of requests) {
      const outcome = byIdentifier.get(`${entry.level.target}|${identifierKey(identifier)}`);
      if (outcome === undefined) continue;
      // Every attempt of a descent is bound to the batch that read it: the descent has the worst of them.
      this.ledger.attemptDescent(entry.descent.read, outcome.batch, identifier);
      outcomes.set(entry, outcome);
    }
    return outcomes;
  }

  /** The batches of a level: the reader divides them when it can, otherwise fixed batches of `batchSize`. */
  private batchesOf(
    reader: TreeLevelReader,
    level: TreeLevel,
    identifiers: ReadonlyArray<EvidenceIdentifier>,
  ): ReadonlyArray<ReadonlyArray<EvidenceIdentifier>> {
    if (reader.batches !== undefined) return reader.batches(identifiers, level.batchSize);
    const size = Math.max(1, level.batchSize ?? DEFAULT_BATCH_SIZE);
    const batches: EvidenceIdentifier[][] = [];
    for (let start = 0; start < identifiers.length; start += size) batches.push(identifiers.slice(start, start + size));
    return batches;
  }

  /** Publishes the read on the parent, enumerates the children, then follows the route of the context rows. */
  private async attach(
    entry: PendingDescent,
    read: ReadonlyArray<unknown>,
    secondAttempt: EvidenceIdentifier | undefined,
  ): Promise<void> {
    const { node, descent, level } = entry;
    const identity = level.rowIdentity;
    // A row an ancestor already holds (the trace read returns the root row too) is not a child.
    const rows = identity === undefined ? read : read.filter((row) => !node.pathRows.has(identity(row)));
    descent.rowCount = rows.length;
    this.publish(node, level, rows);

    const enumerated = level.enumerate({
      context: node.context,
      rows,
      identifier: descent.request.identifier,
      ...(secondAttempt !== undefined ? { secondAttempt } : {}),
    });
    const children: WorkNode[] = [];
    for (const spec of enumerated.nodes) {
      const child = await this.createNode(spec, level, node.context, node, descent);
      descent.childIds.push(child.id);
      children.push(child);
    }

    // The related rows that are not errors may show a route the error branches do not cover: the steps of the level
    // run on them, and their descents go to the parent, through this level.
    const routings = enumerated.routings ?? [];
    if (routings.length === 0 || level.perNode === undefined || level.perNode.length === 0) return;
    const routes: DescendRequest[] = [];
    for (const routing of routings) {
      // The steps of a routing read in a scope of their own, below the node.
      const scope = this.ledger.createScope(node.scope);
      const run = await this.deps.runSteps(
        level.perNode,
        {
          ...createNodeContext(node.context, routing, this.stepIdsOf(node.level)),
          reads: this.ledger.view(scope),
        },
        scope,
      );
      if (run.failure === undefined) routes.push(...run.descends);
      // A routing that failed or read incompletely leaves this read without a proven route: never a complete leaf.
      const incomplete = run.failure !== undefined || this.ledger.hasOwnGaps(scope);
      if (incomplete && this.ledger.descentState(descent.read) === 'queried') {
        this.ledger.markDescent(descent.read, 'unavailable');
        // The parent sees the read as unavailable too: an exclusion not seen is no longer `absent`.
        this.publish(node, level, []);
      }
    }
    // Every route is collected first, then the ones an error branch already covers are left out.
    const covered = new Set<string>();
    for (const child of children)
      for (const childDescent of child.descents) covered.add(routeKey(childDescent.request));
    for (const existing of node.descents) covered.add(routeKey(existing.request));
    const via = [...(descent.request.via ?? []), level.target];
    // The reads traversed by context rows, by target and identifier: a route back to one of them is a cycle.
    const through = new Set([...(descent.through ?? []), descentKey(descent.request)]);
    for (const route of routes) {
      // A route without identifier is kept: it ends as `skipped`, never as a complete leaf. A route back through the
      // reads traversed is kept too: it ends as a cycle.
      if (covered.has(routeKey(route)) && !through.has(descentKey(route))) continue;
      covered.add(routeKey(route));
      node.descents.push({
        request: { ...route, via },
        read: this.ledger.openDescent(node.scope, route.target),
        childIds: [],
        rowCount: 0,
        through,
        from: descent,
      });
    }
  }

  /** Publishes on the parent how the read of a level ended for it, with its rows and exclusions. */
  private publish(node: WorkNode, level: TreeLevel, rows: ReadonlyArray<unknown>): void {
    const prefix = level.varPrefix;
    if (prefix === undefined) return;
    // Every read of this level for the parent combines: the worst state (from the ledger), the rows of all of them,
    // an excluded diagnosis seen in any of them.
    // The accumulator is the node's own: the variables inherited from an ancestor never count as a read of this node.
    const vars = new Map(node.context.vars);
    const reads = node.reads.get(level.target);
    const state = this.ledger.levelState(node.scope, level.target);
    const total = (reads?.rows ?? 0) + rows.length;
    const present = reads?.present ?? new Set<string>();
    node.reads.set(level.target, { rows: total, present });
    vars.set(lookupStateVar(prefix), state);
    vars.set(logCountVar(prefix), String(total));
    if (level.exclusions !== undefined && level.exclusions.length > 0) {
      // The exclusions are evaluated on every row read for this parent.
      const stepResults = new Map(node.context.stepResults);
      if (level.read !== undefined) stepResults.set(level.read.id, rows);
      const readContext: RunbookContext = { ...node.context, stepResults };
      for (const exclusion of level.exclusions) {
        if (sharedConditionEvaluator.evaluate(exclusion.condition, readContext)) present.add(exclusion.name);
        vars.set(
          exclusionVar(prefix, exclusion.name),
          present.has(exclusion.name) ? 'present' : state === 'queried' ? 'absent' : 'unknown',
        );
      }
    }
    node.context = { ...node.context, vars };
  }

  /**
   * Evaluates the nodes from the deepest: the after-descent steps of the level, the outcome of the branch below,
   * then the known cases of the level, on the context the node reached.
   */
  private async evaluate(): Promise<void> {
    const byId = new Map(this.nodes.map((node) => [node.id, node]));
    const casesByLevel = new Map<string, KnownCase[]>();
    for (const knownCase of this.knownCases) {
      for (const target of this.caseLevels.get(knownCase.id) ?? [this.tree.root.target]) {
        const list = casesByLevel.get(target) ?? [];
        list.push(knownCase);
        casesByLevel.set(target, list);
      }
    }

    const deepestFirst = [...this.nodes].sort((a, b) => b.depth - a.depth);
    for (const node of deepestFirst) {
      throwIfRunbookAborted(node.context);
      const afterDescend = node.level.afterDescend ?? [];
      if (afterDescend.length > 0 && node.failure === undefined) {
        const run = await this.deps.runSteps(afterDescend, node.context, node.scope);
        node.context = run.context;
        if (run.failure !== undefined) node.failure = run.failure;
      }
      node.branchOutcome = this.branchOutcome(node, byId);
      node.context = { ...node.context, vars: new Map(node.context.vars).set(BRANCH_OUTCOME_VAR, node.branchOutcome) };
      const occurredAt = node.spec.occurredAt;
      // A case read from variables only has no evidence time: it takes the time of its node.
      node.detections = this.deps
        .evaluateCases(casesByLevel.get(node.level.target) ?? [], node.context, node.id)
        .map((detection) =>
          detection.firstSeenAt !== undefined || occurredAt === undefined
            ? detection
            : { ...detection, firstSeenAt: occurredAt, lastSeenAt: occurredAt },
        );
    }
  }

  /** The node as the execution result reports it. */
  private toTreeNode(node: WorkNode): ErrorTreeNode {
    return {
      id: node.id,
      ...(node.parentId !== undefined ? { parentId: node.parentId } : {}),
      level: node.depth,
      target: node.level.target,
      key: node.spec.key,
      errorKey: node.errorKey,
      ...(node.spec.occurrences !== undefined && node.spec.occurrences > 1
        ? { occurrences: node.spec.occurrences }
        : {}),
      label: node.spec.label,
      ...(node.spec.occurredAt !== undefined ? { occurredAt: node.spec.occurredAt } : {}),
      correlation: node.spec.correlation ?? {},
      ...(node.via !== undefined ? { via: node.via } : {}),
      descents: node.descents.map((descent) => ({
        ...descent.request,
        state: this.ledger.descentState(descent.read) ?? 'skipped',
        childIds: descent.childIds,
        rowCount: descent.rowCount,
        ...(this.viaIncomplete(descent) ? { incompleteVia: true } : {}),
      })),
      status: node.failure !== undefined ? 'failed' : 'ok',
      ...(node.failure !== undefined ? { failure: node.failure } : {}),
      detections: node.detections,
      branchOutcome: node.branchOutcome,
      ...(this.isIncomplete(node) ? { incompleteEvidence: true } : {}),
    };
  }

  /** The read ledger of the execution. */
  private get ledger(): ReadLedger {
    return this.deps.ledger;
  }

  /** Whether the evidence of a node is incomplete, by the gaps of its scope and of its correlation. */
  private isIncomplete(node: WorkNode): boolean {
    return this.ledger.isNodeIncomplete(node.scope, node.spec.correlation ?? {});
  }

  /** The descents without repetitions of the same target, kind and identifier, opened in the scope of the node. */
  private uniqueDescents(requests: ReadonlyArray<DescendRequest>, scope: ReadScope): WorkDescent[] {
    const seen = new Set<string>();
    const descents: WorkDescent[] = [];
    for (const request of requests) {
      const key = descentKey(request);
      if (seen.has(key)) continue;
      seen.add(key);
      descents.push({ request, read: this.ledger.openDescent(scope, request.target), childIds: [], rowCount: 0 });
    }
    return descents;
  }

  /**
   * How the branch strictly below a node ended: a recognized descendant, else an interrupted or incomplete branch,
   * else a complete branch without diagnosis.
   */
  private branchOutcome(node: WorkNode, byId: ReadonlyMap<string, WorkNode>): BranchOutcome {
    let incomplete = node.failure !== undefined;
    const stack = [node];
    let diagnosed = false;
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) continue;
      if (current !== node && current.detections.length > 0) diagnosed = true;
      if (current !== node && (current.failure !== undefined || this.isIncomplete(current))) incomplete = true;
      for (const descent of current.descents) {
        if (this.ledger.descentState(descent.read) !== 'queried') incomplete = true;
        for (const childId of descent.childIds) {
          const child = byId.get(childId);
          if (child !== undefined) stack.push(child);
        }
      }
    }
    if (diagnosed) return 'diagnosed';
    return incomplete ? 'incomplete' : 'undiagnosed';
  }

  /** Whether a read traversed by context rows to reach a descent was incomplete. */
  private viaIncomplete(descent: WorkDescent): boolean {
    for (let from = descent.from; from !== undefined; from = from.from) {
      if (this.ledger.descentState(from.read) !== 'queried') return true;
    }
    return false;
  }

  /** The id, made unique in the tree. */
  private uniqueId(id: string): string {
    let unique = id;
    let index = 2;
    while (this.nodeIds.has(unique)) {
      unique = `${id}#${String(index)}`;
      index += 1;
    }
    this.nodeIds.add(unique);
    return unique;
  }
}

/** The identities of the rows a node scopes, when the level can tell them. */
function rowIdentities(spec: ErrorNodeSpec, level: TreeLevel): ReadonlyArray<string> {
  const identity = level.rowIdentity;
  if (identity === undefined) return [];
  return Object.values(spec.scopedOutputs).flatMap((rows) => rows.map((row) => identity(row)));
}

/** Identity of a descent in a chain. */
function descentKey(request: DescendRequest): string {
  return `${request.target}|${identifierKey(request.identifier)}`;
}

/** A route is covered by a branch with the same target and identifier. */
function routeKey(request: DescendRequest): string {
  return `${request.target}|${request.identifier.value}`;
}

/** The rows of two attempts, a row found by both kept once. */
function mergeRows(
  first: ReadonlyArray<unknown>,
  second: ReadonlyArray<unknown>,
  level: TreeLevel,
): ReadonlyArray<unknown> {
  const identity = level.rowIdentity;
  if (identity === undefined) return [...first, ...second];
  const seen = new Set(first.map((row) => identity(row)));
  return [...first, ...second.filter((row) => !seen.has(identity(row)))];
}
