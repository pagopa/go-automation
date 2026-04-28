export const RULE_SET_NAMES = ['monorepo', 'scripts', 'functions'] as const;

export type RuleSetName = (typeof RULE_SET_NAMES)[number];

interface ValidationGroupConfigBase {
  readonly name: string;
  readonly ruleSet: RuleSetName;
  readonly exclude: ReadonlyArray<string>;
}

export type ValidationGroupConfig =
  | (ValidationGroupConfigBase & {
      readonly paths: ReadonlyArray<string>;
      readonly include?: never;
    })
  | (ValidationGroupConfigBase & {
      readonly include: ReadonlyArray<string>;
      readonly paths?: never;
    });

export interface ValidateScaffoldConfig {
  readonly groups: ReadonlyArray<ValidationGroupConfig>;
}

export function isRuleSetName(value: string): value is RuleSetName {
  return (RULE_SET_NAMES as ReadonlyArray<string>).includes(value);
}
