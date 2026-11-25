import type { ReadState } from '../types/ReadState.js';

/** A gap attributed to a scope or to a batch: its state and, when it names some, the keys of its identifiers. */
export interface Gap {
  readonly state: ReadState;
  readonly identifiers?: ReadonlySet<string>;
}
