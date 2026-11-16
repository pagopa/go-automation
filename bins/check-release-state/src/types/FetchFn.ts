/** The `fetch` the client uses; injected so tests need no network. */
export type FetchFn = (
  url: string,
  init: { readonly headers: Readonly<Record<string, string>> },
) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}>;
