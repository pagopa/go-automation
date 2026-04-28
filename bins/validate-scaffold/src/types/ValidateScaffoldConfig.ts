export const RULE_SET_NAMES = ['monorepo', 'scripts', 'functions'] as const;

export type RuleSetName = (typeof RULE_SET_NAMES)[number];

export interface ValidationGroupConfig {
  readonly name: string;
  readonly ruleSet: RuleSetName;
  readonly paths?: ReadonlyArray<string>;
  readonly include?: ReadonlyArray<string>;
  readonly exclude?: ReadonlyArray<string>;
}

export interface ValidateScaffoldConfig {
  readonly groups: ReadonlyArray<ValidationGroupConfig>;
}

export function isRuleSetName(value: string): value is RuleSetName {
  return (RULE_SET_NAMES as ReadonlyArray<string>).includes(value);
}
