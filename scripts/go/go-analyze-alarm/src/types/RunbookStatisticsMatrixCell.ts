/**
 * One cell of the product × kind cross tabulation.
 */
export interface RunbookStatisticsMatrixCell {
  /** Product owning the runbooks counted in the cell */
  readonly product: string;
  /** Runbook family counted in the cell */
  readonly kind: string;
  /** Runbooks with that product and that kind */
  readonly runbooks: number;
  /** Alarm names covered by those runbooks */
  readonly alarms: number;
}
