/** A chain of a group, for display: its key and its correlation. */
export interface ErrorChainSample {
  readonly key: string;
  readonly correlation: Readonly<Record<string, string>>;
}
