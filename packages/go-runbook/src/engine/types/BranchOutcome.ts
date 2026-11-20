/**
 * How the branch strictly below a node ended: `diagnosed` (a recognized node below), `incomplete` (no diagnosis, and
 * an interrupted chain or incomplete evidence below) or `undiagnosed` (no diagnosis on a complete branch, including a
 * complete empty descent).
 */
export type BranchOutcome = 'diagnosed' | 'incomplete' | 'undiagnosed';
