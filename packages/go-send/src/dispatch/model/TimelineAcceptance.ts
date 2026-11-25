/**
 * SEND's acceptance of a notification as read from its timeline by the
 * requestId phase (`acceptanceFromTimeline`): `ACCEPTED` when the timeline
 * holds a category SEND writes only after accepting, `REFUSED` when it holds
 * `REQUEST_REFUSED`. A timeline with neither gives no value.
 */
export type TimelineAcceptance = 'ACCEPTED' | 'REFUSED';
