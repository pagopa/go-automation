/**
 * What to do once a runbook has been analysed.
 *
 * `SAME_PRODUCT` skips the product and environment steps, which is the common
 * case while reviewing several runbooks of the same product.
 */
export type NextRunChoice = 'SAME_PRODUCT' | 'CHANGE_PRODUCT' | 'EXIT';
