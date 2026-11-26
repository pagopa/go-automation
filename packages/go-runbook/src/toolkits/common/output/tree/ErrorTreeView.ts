import type {
  ErrorChainInterruptionReason,
  ErrorTreeNode,
  IdentifierObservation,
  KnownCaseDetection,
  ObservedErrors,
  RunbookExecutionResult,
  TreeChain,
  TreeChainGroup,
} from '../../../../engine/index.js';
import type { CoverageLevelOutput } from '../CoverageLevelOutput.js';
import { CORRELATION_KINDS } from './CORRELATION_KINDS.js';
import type { ErrorTreeNodeStatus } from './ErrorTreeNodeStatus.js';

/** The counts of one level while they are added up. */
interface LevelCounts {
  target: string;
  nodes: number;
  recognized: number;
  unrecognized: number;
  failed: number;
  lowerBound: boolean;
}

/**
 * The error tree of an execution as the output and the analysis draft read it: its nodes, their paths, the chains,
 * and the counts by level and by interruption. Built once per result; without a tree it is empty.
 *
 * @example
 * ```typescript
 * const view = new ErrorTreeView(result);
 * const leaf = view.representative();
 * ```
 */
export class ErrorTreeView {
  readonly hasTree: boolean;
  readonly chains: ReadonlyArray<TreeChainGroup>;
  private readonly nodes: ReadonlyArray<ErrorTreeNode>;
  private readonly byId: ReadonlyMap<string, ErrorTreeNode>;
  private readonly byDetection: ReadonlyMap<KnownCaseDetection, ErrorTreeNode>;

  /**
   * @param result - The tree and the chains of an execution
   */
  constructor(result: Pick<RunbookExecutionResult, 'tree' | 'chains'>) {
    this.hasTree = result.tree !== undefined;
    this.nodes = result.tree ?? [];
    this.chains = result.chains ?? [];
    this.byId = new Map(this.nodes.map((node) => [node.id, node]));
    this.byDetection = new Map(
      this.nodes.flatMap((node) => node.detections.map((detection) => [detection, node] as const)),
    );
  }

  /**
   * @param id - Id of a node
   * @returns The node, or nothing
   */
  node(id: string): ErrorTreeNode | undefined {
    return this.byId.get(id);
  }

  /**
   * @param id - Id of a node
   * @returns The nodes from the root to the node, empty for an unknown id
   */
  path(id: string): ReadonlyArray<ErrorTreeNode> {
    const path: ErrorTreeNode[] = [];
    for (let node = this.byId.get(id); node !== undefined; node = this.parentOf(node)) path.unshift(node);
    return path;
  }

  /**
   * @param id - Id of a node
   * @returns The keys of its path, from the root, joined by ` > `
   */
  keyPath(id: string): string {
    return this.path(id)
      .map((node) => node.key)
      .join(' > ');
  }

  /**
   * @param detection - A detection of the tree
   * @returns The node that recognized it, or nothing for a window detection
   */
  nodeOf(detection: KnownCaseDetection): ErrorTreeNode | undefined {
    return this.byDetection.get(detection);
  }

  /**
   * @param chain - A chain of the tree
   * @returns Its nodes, from the root
   */
  chainNodes(chain: TreeChain): ReadonlyArray<ErrorTreeNode> {
    return chain.nodeIds.flatMap((id) => {
      const node = this.byId.get(id);
      return node === undefined ? [] : [node];
    });
  }

  /**
   * @param chain - A chain of the tree
   * @returns Its last node, or nothing
   */
  last(chain: TreeChain): ErrorTreeNode | undefined {
    return this.byId.get(chain.nodeIds[chain.nodeIds.length - 1] ?? '');
  }

  /**
   * @returns The last node of the first chain of the first group, the one the output describes
   */
  representative(): ErrorTreeNode | undefined {
    const chain = this.chains[0]?.members[0];
    return chain === undefined ? undefined : this.last(chain);
  }

  /**
   * @param node - A node of the tree
   * @returns Whether it recognized a case, found an unrecognized error or failed
   */
  statusOf(node: ErrorTreeNode): ErrorTreeNodeStatus {
    if (node.status === 'failed') return 'failed';
    return node.detections.length > 0 ? 'recognized' : 'unrecognized';
  }

  /**
   * @returns The number of distinct unrecognized errors at the leaf of a complete chain: a leaf reached by several
   *   paths is one error
   */
  unrecognizedLeaves(): number {
    const leaves = new Set<string>();
    for (const chain of this.members()) {
      if (chain.end !== 'leaf') continue;
      const leaf = this.last(chain);
      if (leaf !== undefined && this.statusOf(leaf) === 'unrecognized') leaves.add(leaf.errorKey);
    }
    return leaves.size;
  }

  /**
   * @param chains - Chains of the tree
   * @returns The number of distinct errors the chains end on: an error reached by several paths counts once
   */
  distinctErrors(chains: ReadonlyArray<TreeChain>): number {
    return new Set(chains.map((chain) => this.last(chain)?.errorKey ?? chain.nodeIds.join('>'))).size;
  }

  /**
   * @returns The number of interrupted chains by reason, in the order the reasons first occur
   */
  interruptions(): ReadonlyMap<ErrorChainInterruptionReason, number> {
    const counts = new Map<ErrorChainInterruptionReason, number>();
    for (const chain of this.members()) {
      const reason = chain.interruption?.reason;
      if (reason !== undefined) counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
    return counts;
  }

  /**
   * @returns Whether a chain ends before a leaf
   */
  hasInterruptedChains(): boolean {
    return this.members().some((chain) => chain.end === 'interrupted');
  }

  /**
   * The counts of every level: a level reached by a descent exists even without nodes, and is a lower bound when the
   * descent was not read completely; the roots are a lower bound when the observed errors are.
   *
   * @param observedErrors - The errors observed at the root, if any
   * @returns The levels, in the order they are first met
   */
  levels(observedErrors?: ObservedErrors): ReadonlyArray<CoverageLevelOutput> {
    const levels = new Map<string, LevelCounts>();
    const level = (target: string): LevelCounts => {
      const existing = levels.get(target);
      if (existing !== undefined) return existing;
      const created: LevelCounts = { target, nodes: 0, recognized: 0, unrecognized: 0, failed: 0, lowerBound: false };
      levels.set(target, created);
      return created;
    };
    for (const node of this.nodes) {
      const counts = level(node.target);
      counts.nodes += 1;
      counts[this.statusOf(node)] += 1;
      if (node.parentId === undefined && observedErrors?.lowerBound === true) counts.lowerBound = true;
      for (const descent of node.descents) {
        const below = level(descent.target);
        if (descent.state !== 'queried') below.lowerBound = true;
      }
    }
    return [...levels.values()].map(({ lowerBound, ...counts }) => (lowerBound ? { ...counts, lowerBound } : counts));
  }

  /**
   * @param node - A node of the tree
   * @returns The identifiers of its correlation, observed when the node occurred
   */
  correlationObservations(node: ErrorTreeNode): ReadonlyArray<IdentifierObservation> {
    return Object.entries(node.correlation).flatMap(([key, value]): IdentifierObservation[] => {
      const kind = CORRELATION_KINDS.get(key);
      if (kind === undefined || value === '') return [];
      return [{ kind, value, ...(node.occurredAt !== undefined ? { observedAt: node.occurredAt } : {}) }];
    });
  }

  /** Every chain of every group. */
  private members(): ReadonlyArray<TreeChain> {
    return this.chains.flatMap((group) => group.members);
  }

  private parentOf(node: ErrorTreeNode): ErrorTreeNode | undefined {
    return node.parentId === undefined ? undefined : this.byId.get(node.parentId);
  }
}
