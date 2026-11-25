import type { TemplatePlaceholderSource } from './TemplatePlaceholderSource.js';

export interface TemplatePlaceholder {
  readonly raw: string;
  readonly source: TemplatePlaceholderSource;
  readonly key: string;
}
