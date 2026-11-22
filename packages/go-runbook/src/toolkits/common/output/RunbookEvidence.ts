export interface RunbookEvidence {
  readonly id: string;
  readonly label: string;
  readonly type: 'summary' | 'log-sample' | 'step-output' | 'artifact';
  readonly sourceStep?: string;
  /** The error node the evidence belongs to (`request-id > e1`), in a runbook with an error tree. */
  readonly node?: string;
  readonly items?: ReadonlyArray<Readonly<Record<string, string>>>;
  readonly truncated?: boolean;
}
