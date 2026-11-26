import type { KnownUrl } from './KnownUrl.js';
import type { UrlMatcherFn } from './UrlMatcherFn.js';

export interface CompiledEntry {
  readonly known: KnownUrl;
  readonly matcher: UrlMatcherFn;
}
