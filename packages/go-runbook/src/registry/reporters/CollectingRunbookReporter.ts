import type { TreeNode } from '@go-automation/go-common/core';

import type { RunbookReporter } from '../RunbookReporter.js';

/**
 * Reporter that keeps the narrative as values, so tests assert on structure
 * instead of on strings with the right number of spaces.
 *
 * Sections and nodes are collected separately: assertions target either the
 * section titles or the node tree, which is what a test needs. Use
 * {@link ConsoleRunbookReporter} when the interleaving matters.
 */
export class CollectingRunbookReporter implements RunbookReporter {
  private readonly collectedSections: string[] = [];
  private readonly collectedNodes: TreeNode[] = [];

  /** Titles of the sections opened so far, in order. */
  get sections(): ReadonlyArray<string> {
    return this.collectedSections;
  }

  /** Nodes reported so far, in order. */
  get nodes(): ReadonlyArray<TreeNode> {
    return this.collectedNodes;
  }

  section(title: string): void {
    this.collectedSections.push(title);
  }

  add(...nodes: ReadonlyArray<TreeNode>): void {
    this.collectedNodes.push(...nodes);
  }

  flush(): void {
    // nothing is buffered
  }
}
