import type { TreeNode } from '@go-automation/go-common/core';

/**
 * Narrative channel of a runbook execution.
 *
 * Steps describe **what** they observed; branch characters, indentation and the
 * moment of printing belong to the implementation. A step never writes a `├─`,
 * a `└─` or a leading space.
 */
export interface RunbookReporter {
  /**
   * Opens a top-level section, closing the previous one.
   *
   * @param title - Section title, without decoration
   */
  section(title: string): void;

  /**
   * Adds nodes at the current level, in display order. Children of a node nest
   * below it.
   *
   * @param nodes - Nodes contributed by the current step
   */
  add(...nodes: ReadonlyArray<TreeNode>): void;

  /**
   * Closes the current level, emitting the pending node as its last one.
   *
   * Called by the engine at the end of the execution — **steps must not call
   * it**: a step cannot know whether another step will still report.
   */
  flush(): void;
}
