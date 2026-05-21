/**
 * Generic context included in a runbook result output.
 *
 * `fields` is intended for dashboards and concise operator views,
 * `evidence` carries bounded supporting samples, and `details` can hold
 * a domain-specific typed payload.
 */
export interface RunbookOutputContext {
  readonly fields: ReadonlyArray<RunbookResultField>;
  readonly evidence: ReadonlyArray<RunbookEvidence>;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface RunbookResultField {
  readonly name: string;
  readonly label: string;
  readonly value: string;
}

export interface RunbookEvidence {
  readonly id: string;
  readonly label: string;
  readonly type: 'summary' | 'log-sample' | 'step-output' | 'artifact';
  readonly sourceStep?: string;
  readonly items?: ReadonlyArray<Readonly<Record<string, string>>>;
  readonly truncated?: boolean;
}

export function emptyRunbookOutputContext(): RunbookOutputContext {
  return { fields: [], evidence: [] };
}
