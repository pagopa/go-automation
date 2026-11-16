/**
 * Reference from a source step to a goTo target for static analysis.
 */
export interface GoToReference {
  readonly sourceId: string;
  readonly targetId: string;
}

/**
 * Analyzes the directed graph formed by goTo references to detect cycles.
 * Uses DFS (Depth-First Search) with node coloring.
 *
 * Complexity: O(V + E) where V is the number of steps and E is the number of edges
 */
export class GoToGraphAnalyzer {
  /**
   * Detects cycles in the goTo graph.
   *
   * @param stepIds - Ordered array of all step IDs
   * @param goToRefs - GoTo references collected from steps
   * @returns Array of cycles found (each cycle is an array of step IDs)
   */
  static detectCycles(stepIds: ReadonlyArray<string>, goToRefs: ReadonlyArray<GoToReference>): ReadonlyArray<string[]> {
    // Build adjacency list
    const adjacency = new Map<string, string[]>();
    for (const id of stepIds) {
      adjacency.set(id, []);
    }

    // Add implicit sequential edges: step[i] -> step[i+1]
    for (let i = 0; i < stepIds.length - 1; i++) {
      const current = stepIds[i];
      const next = stepIds[i + 1];
      if (current !== undefined && next !== undefined) {
        const edges = adjacency.get(current);
        if (edges !== undefined) {
          edges.push(next);
        }
      }
    }

    // Add goTo edges
    for (const ref of goToRefs) {
      const edges = adjacency.get(ref.sourceId);
      if (edges !== undefined) {
        edges.push(ref.targetId);
      }
    }

    // DFS with coloring: WHITE=unvisited, GRAY=in progress, BLACK=completed
    const white = 0;
    const gray = 1;
    const black = 2;
    const color = new Map<string, number>();
    for (const id of stepIds) {
      color.set(id, white);
    }

    const cycles: string[][] = [];
    const path: string[] = [];

    const dfs = (nodeId: string): void => {
      color.set(nodeId, gray);
      path.push(nodeId);

      const neighbors = adjacency.get(nodeId) ?? [];
      for (const neighbor of neighbors) {
        const neighborColor = color.get(neighbor);
        if (neighborColor === gray) {
          // Cycle found: extract cycle from path
          const cycleStart = path.indexOf(neighbor);
          if (cycleStart !== -1) {
            cycles.push([...path.slice(cycleStart), neighbor]);
          }
        } else if (neighborColor === white) {
          dfs(neighbor);
        }
      }

      path.pop();
      color.set(nodeId, black);
    };

    for (const id of stepIds) {
      if (color.get(id) === white) {
        dfs(id);
      }
    }

    return cycles;
  }
}
