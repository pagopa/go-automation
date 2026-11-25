/** Limits the draft is fitted to; the defaults are those of the analysis contract. */
export interface AnalysisDraftLimits {
  /** Characters of `conclusionNotes` and of `errorDetails`, each. */
  readonly textLength: number;
  /** Bytes of the draft serialized as UTF-8 JSON. */
  readonly draftBytes: number;
  /** Items of each reference list (`resources`, `downstreams`, `finalActions`, `links`); defaults to the contract's. */
  readonly arrayItems?: number;
}
