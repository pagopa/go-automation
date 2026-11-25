/** One query of an account log diagnosis, with the kind that tags its rows. */
export interface AccountLogQuery {
  readonly kind: string;
  readonly query: string;
}
