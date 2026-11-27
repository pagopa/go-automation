/** Distinct ERROR messages of a pn-delayer batch job, limited after deduplication, preserving the raw log. */
export const DELAYER_ERROR_QUERY = `filter @message like 'ERROR'
| sort @timestamp asc
| display @timestamp, trace_id, message, @message
| dedup message
| limit 1000`;
