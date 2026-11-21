/**
 * A node produced by the enumerator of a level: one error, with its rows.
 *
 * In the context of the node, `steps.<id>` returns only `scopedOutputs[id]`, `steps.<id>.context` the related rows
 * that are not errors and `steps.<id>.siblings` the other error rows of the same identifier.
 */
export interface ErrorNodeSpec {
  /** Identity in the level: request id, trace id, row identity, or a synthetic key. */
  readonly key: string;
  /** Short description: «500 POST /delivery», «errore in pn-delivery». */
  readonly label: string;
  /** ISO-8601 UTC time of the error. */
  readonly occurredAt?: string;
  /** Validated, bounded, safe identifiers of the node (request id, trace id, source). */
  readonly correlation?: Readonly<Record<string, string>>;
  /** Variables of the node, visible to its own steps and cases and to its descendants. */
  readonly vars?: Readonly<Record<string, string>>;
  /** The error rows of the node, by step id. */
  readonly scopedOutputs: Readonly<Record<string, ReadonlyArray<unknown>>>;
  /** Related rows that are not errors (INFO, successes), by step id. */
  readonly contextOutputs?: Readonly<Record<string, ReadonlyArray<unknown>>>;
  /** Other error rows of the same identifier, by step id: supporting evidence a case may ask for. */
  readonly siblingOutputs?: Readonly<Record<string, ReadonlyArray<unknown>>>;
  /** Identities of the rows of the node: a descendant never enumerates a row of an ancestor again. */
  readonly rowIdentities?: ReadonlyArray<string>;
}
