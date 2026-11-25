/** Tells whether a received service value can serve a step that declared it as required. */
export type ServiceCapabilityPredicate = (service: unknown) => boolean;
