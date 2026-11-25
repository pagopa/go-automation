export interface ProcedureSuccessOutcome {
  readonly kind: 'procedure-success';
  readonly summary: string;
  readonly metrics?: Readonly<Record<string, number | string>>;
}
