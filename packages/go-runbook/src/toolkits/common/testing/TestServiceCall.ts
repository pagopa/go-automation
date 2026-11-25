/** A call to `forTarget` or `forExecution` recorded by a fake service of {@link createTestServiceRegistry}. */
export interface TestServiceCall {
  /** Called method. */
  readonly method: string;
  /** Arguments of the call. */
  readonly args: ReadonlyArray<unknown>;
}
