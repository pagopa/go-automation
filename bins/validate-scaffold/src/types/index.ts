/**
 * Types barrel file
 */
export type { RuleResult } from './RuleResult.js';
export type {
  RuleSeverity,
  ScaffoldRule,
  FileExistsRule,
  FileContainsRule,
  FileNotContainsRule,
  JsonHasKeyRule,
  JsonKeyEqualsRule,
  CustomRule,
  CustomRuleResult,
} from './ScaffoldRule.js';
export type { RuleSetName, ValidateScaffoldConfig, ValidationGroupConfig } from './ValidateScaffoldConfig.js';
