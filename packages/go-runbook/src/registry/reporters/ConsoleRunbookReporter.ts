import type { GOLogger, TreeNode } from '@go-automation/go-common/core';
import { renderTree } from '@go-automation/go-common/core';

import type { RunbookReporter } from '../RunbookReporter.js';

/**
 * Writes the runbook narrative to a {@link GOLogger}, keeping the output
 * streaming while still choosing the right branch for every node.
 *
 * A node cannot be drawn the moment it arrives, because whether it is the last
 * of its level is only known once the next one shows up. The reporter therefore
 * holds **one** node back: when a sibling arrives the held node is emitted with
 * a `tee`, and when the level closes the held node is emitted with an `elbow`.
 * The operator sees the narrative as it happens, one node behind.
 */
export class ConsoleRunbookReporter implements RunbookReporter {
  private held: TreeNode | undefined;

  constructor(private readonly logger: GOLogger) {}

  section(title: string): void {
    this.flush();
    this.logger.newline();
    this.logger.text(`═══ ${title} ═══`);
  }

  add(...nodes: ReadonlyArray<TreeNode>): void {
    for (const node of nodes) {
      this.emitHeld(true);
      this.held = node;
    }
  }

  flush(): void {
    this.emitHeld(false);
  }

  private emitHeld(siblingsFollow: boolean): void {
    const node = this.held;
    if (node === undefined) {
      return;
    }
    this.held = undefined;
    for (const line of renderTree([node], { siblingsFollow })) {
      this.logger.text(line);
    }
  }
}
