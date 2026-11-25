import type { TemplatePlaceholder } from './TemplatePlaceholder.js';

export type TemplatePlaceholderTransformer = (placeholder: TemplatePlaceholder) => string;
