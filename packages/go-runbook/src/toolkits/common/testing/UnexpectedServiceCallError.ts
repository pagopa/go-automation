/**
 * Thrown by a fake service of {@link createTestServiceRegistry} when a test calls
 * a method it did not stub (EVO-RBREORG-OPUS-01 RBREORG-18).
 */
export class UnexpectedServiceCallError extends Error {
  override readonly name = 'UnexpectedServiceCallError';

  /**
   * @param method - Called method, as `<service>.<method>`
   */
  constructor(readonly method: string) {
    super(`Unexpected call to the test service method ${method}: stub it in createTestServiceRegistry`);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
