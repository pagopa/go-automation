/**
 * A group of the PA, as returned by `GET /ext-registry-b2b/pa/v1/groups`.
 */
export interface DispatchGroup {
  readonly id: string;
  readonly name: string;
  readonly status: string;
}
