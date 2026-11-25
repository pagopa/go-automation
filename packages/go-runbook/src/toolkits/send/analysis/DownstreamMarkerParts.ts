/**
 * What a `[DOWNSTREAM]` marker reports after `returned errors=`: the HTTP status and method are regular-expression
 * fragments (`'(POST|PUT)'` is a valid method), the endpoint is a literal URL.
 */
export interface DownstreamMarkerParts {
  readonly status?: string;
  readonly method?: string;
  readonly endpoint?: string;
}
