/**
 * State of the read of a step: `queried` when it read everything, otherwise why it did not. An absence (a count of
 * zero) is evidence only when the read was `queried`.
 */
export type StepLookupState = 'queried' | 'saturated' | 'unavailable' | 'skipped';
