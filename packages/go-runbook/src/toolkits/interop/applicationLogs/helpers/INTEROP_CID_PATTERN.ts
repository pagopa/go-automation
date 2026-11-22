/** The correlation id an INTEROP log line writes as `CID=<value>`; the value is the first group. */
export const INTEROP_CID_PATTERN: RegExp = /\bCID=([^\]\s,"']+)/u;
