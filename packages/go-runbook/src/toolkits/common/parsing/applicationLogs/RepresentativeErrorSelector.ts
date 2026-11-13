import type { RepresentativeErrorPolicy } from './RepresentativeErrorPolicy.js';
import type { ServiceLogRow } from './ServiceLogRow.js';

/**
 * Accumulates the representative error of one scan under a declared policy.
 * Create one per scan: it keeps the candidates seen so far.
 */
export class RepresentativeErrorSelector {
  private byLevel = '';
  private byKeyword = '';

  /**
   * @param policy - How the representative error is chosen
   */
  constructor(private readonly policy: RepresentativeErrorPolicy) {}

  /**
   * Considers a row.
   *
   * @param row - Row read by `readServiceLogRow`
   */
  offer(row: ServiceLogRow): void {
    if (row.message === '') return;
    if (this.policy === 'latest') {
      if (row.isErrorLevel) this.byLevel = row.message;
      else if (row.level === '' && row.hasErrorKeyword) this.byKeyword = row.message;
      return;
    }
    if (row.isErrorLevel && row.message.length > this.byLevel.length) this.byLevel = row.message;
    if ((row.level === '' || row.isErrorLevel) && row.hasErrorKeyword && row.message.length > this.byKeyword.length) {
      this.byKeyword = row.message;
    }
  }

  /**
   * The representative error of the rows offered so far.
   *
   * @returns The level-based choice, else the keyword-based one, else `''`
   */
  result(): string {
    return this.byLevel !== '' ? this.byLevel : this.byKeyword;
  }
}
