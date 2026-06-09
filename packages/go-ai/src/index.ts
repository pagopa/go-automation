/**
 * @go-automation/go-ai
 * Public API
 */

export { GOBedrockClient } from './GOBedrockClient.js';
export type { GOBedrockClientOptions } from './GOBedrockClient.js';
export { GOAISemanticMatcher, parseGOSemanticMatchResult } from './GOAISemanticMatcher.js';
export type { GOAISemanticMatcherOptions } from './GOAISemanticMatcher.js';
export { parseGOAIJsonOutput, stripGOAIOutputFence, parseGOAIOutput } from './GOAIOutputParser.js';
export { GOAIHat } from './types/index.js';
export type {
  GOAIInvoker,
  GOAIRequest,
  GOAIResponse,
  GOSemanticMatchInput,
  GOSemanticMatchResult,
  GOSemanticMatchVerdict,
} from './types/index.js';
