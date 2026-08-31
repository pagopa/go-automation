/**
 * AST-based parser for config.ts files
 *
 * Uses the TypeScript compiler API to extract parameter definitions
 * from the `scriptParameters` array in each script's config.ts.
 * This avoids fragile regex matching and handles all valid TS syntax.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as ts from 'typescript';

/** Represents a single parameter extracted from config.ts */
interface ConfigParameter {
  /** Parameter name as declared (e.g. 'start.date', 'aws.profile') */
  readonly name: string;
  /** CLI-style flag (e.g. '--start-date') derived from the name */
  readonly cliFlag: string;
  /** Environment variable (e.g. 'START_DATE') derived from the name */
  readonly envVar: string;
  /** Alias flags (e.g. ['-sd']) */
  readonly aliases: ReadonlyArray<string>;
  /** Whether the parameter is required */
  readonly required: boolean;
  /** `cliFlag` as written in the source, when the parameter spells it out */
  readonly explicitCliFlag?: string | undefined;
  /** `envVar` as written in the source, when the parameter spells it out */
  readonly explicitEnvVar?: string | undefined;
  /** 1-based line of the parameter declaration */
  readonly line: number;
}

/**
 * An explicit `envVar` or `cliFlag` that only restates what GOScript already
 * derives from `name`.
 */
export interface RedundantOverride {
  /** Name of the parameter carrying the override */
  readonly parameter: string;
  /** Which of the two properties is redundant */
  readonly property: 'envVar' | 'cliFlag';
  /** Value as written in the source */
  readonly value: string;
  /** Value GOScript would derive on its own */
  readonly derived: string;
  /** 1-based line of the parameter declaration */
  readonly line: number;
}

/** Converts a parameter name to the same kebab-case CLI flag format used by GOScript. */
function toCliFlag(name: string): string {
  return `--${name
    .split('.')
    .flatMap((part) => splitCamelCase(part))
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')}`;
}

/** Converts a parameter name to the same environment variable used by GOScript. */
function toEnvironmentKey(name: string): string {
  return name
    .split('.')
    .flatMap((part) => splitCamelCase(part))
    .join('_')
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_');
}

function toAliasFlag(alias: string): string {
  if (alias.startsWith('-')) return alias;
  return toCliFlag(alias).replace(/^--/, '-');
}

function splitCamelCase(value: string): string[] {
  if (value === '') return [];
  return value
    .replace(/([a-z])([A-Z])/g, '$1.$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1.$2')
    .split('.');
}

/**
 * Extracts the string value from a string literal AST node.
 * Returns undefined for non-string-literal nodes.
 */
function getStringLiteral(node: ts.Node): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return undefined;
}

/**
 * Resolves a string value, following identifiers back to the string constants
 * declared in the same file (the framework names its parameters that way).
 */
function resolveStringValue(node: ts.Node, constants: ReadonlyMap<string, string>): string | undefined {
  const literal = getStringLiteral(node);
  if (literal !== undefined) return literal;

  if (ts.isIdentifier(node)) return constants.get(node.text);

  return undefined;
}

/**
 * Indexes every top-level `const NAME = 'value'` so identifier references can be resolved.
 */
function collectStringConstants(sourceFile: ts.SourceFile): ReadonlyMap<string, string> {
  const constants = new Map<string, string>();

  function visit(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) {
      const value = getStringLiteral(node.initializer);
      if (value !== undefined) constants.set(node.name.text, value);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return constants;
}

/**
 * Extracts the boolean value from a boolean literal AST node.
 * Returns undefined for non-boolean nodes.
 */
function getBooleanLiteral(node: ts.Node): boolean | undefined {
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  return undefined;
}

/**
 * Extracts property value from an object literal by property name.
 */
function getPropertyNode(obj: ts.ObjectLiteralExpression, propertyName: string): ts.Node | undefined {
  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === propertyName) {
      return prop.initializer;
    }
  }
  return undefined;
}

/**
 * Extracts string array values from an array literal AST node.
 */
function getStringArray(node: ts.Node, constants: ReadonlyMap<string, string>): ReadonlyArray<string> {
  if (!ts.isArrayLiteralExpression(node)) return [];
  const result: string[] = [];
  for (const element of node.elements) {
    const value = resolveStringValue(element, constants);
    if (value !== undefined) {
      result.push(value);
    }
  }
  return result;
}

/**
 * Parses a single parameter object literal from the AST.
 */
function parseParameterObject(
  obj: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
  constants: ReadonlyMap<string, string>,
): ConfigParameter | undefined {
  const nameNode = getPropertyNode(obj, 'name');
  if (nameNode === undefined) return undefined;

  const name = resolveStringValue(nameNode, constants);
  if (name === undefined) return undefined;

  const requiredNode = getPropertyNode(obj, 'required');
  const required = requiredNode !== undefined ? (getBooleanLiteral(requiredNode) ?? false) : false;

  const aliasesNode = getPropertyNode(obj, 'aliases');
  const rawAliases = aliasesNode !== undefined ? getStringArray(aliasesNode, constants) : [];
  const aliases = rawAliases.map(toAliasFlag);

  const cliFlagNode = getPropertyNode(obj, 'cliFlag');
  const envVarNode = getPropertyNode(obj, 'envVar');

  return {
    name,
    cliFlag: toCliFlag(name),
    envVar: toEnvironmentKey(name),
    aliases,
    required,
    explicitCliFlag: cliFlagNode !== undefined ? resolveStringValue(cliFlagNode, constants) : undefined,
    explicitEnvVar: envVarNode !== undefined ? resolveStringValue(envVarNode, constants) : undefined,
    line: sourceFile.getLineAndCharacterOfPosition(obj.getStart()).line + 1,
  };
}

/**
 * Tells whether a declaration holds a list of GOScript parameters.
 *
 * The name is the convention every script follows, the type annotation catches
 * the lists the framework itself declares under other names.
 */
function isParameterArrayDeclaration(declaration: ts.VariableDeclaration): boolean {
  if (ts.isIdentifier(declaration.name) && declaration.name.text === 'scriptParameters') return true;
  return declaration.type?.getText().includes('GOConfigParameterOptions') === true;
}

/**
 * Finds every exported list of parameters in the AST and extracts their objects.
 */
function findScriptParameters(sourceFile: ts.SourceFile): ReadonlyArray<ConfigParameter> {
  const parameters: ConfigParameter[] = [];
  const constants = collectStringConstants(sourceFile);

  function visit(node: ts.Node): void {
    // Look for: export const scriptParameters = [ ... ]
    if (ts.isVariableStatement(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      for (const decl of node.declarationList.declarations) {
        if (isParameterArrayDeclaration(decl) && decl.initializer) {
          let arrayNode = decl.initializer;

          // Handle `[ ... ] as const` expression
          if (ts.isAsExpression(arrayNode)) {
            arrayNode = arrayNode.expression;
          }

          if (ts.isArrayLiteralExpression(arrayNode)) {
            for (const element of arrayNode.elements) {
              if (ts.isObjectLiteralExpression(element)) {
                const param = parseParameterObject(element, sourceFile, constants);
                if (param !== undefined) {
                  parameters.push(param);
                }
              }
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return parameters;
}

/**
 * Parses config.ts from a script directory and extracts all parameter definitions.
 *
 * @param scriptPath - Absolute path to the script directory
 * @returns Array of parsed parameters, or empty array if config.ts is missing or unparseable
 */
export async function extractConfigParameters(scriptPath: string): Promise<ReadonlyArray<ConfigParameter>> {
  return await extractParametersFromFile(path.join(scriptPath, 'src', 'config.ts'));
}

/**
 * Parses any file declaring GOScript parameters and extracts their definitions.
 *
 * @param filePath - Absolute path to the TypeScript file
 * @returns Array of parsed parameters, or empty array if the file is missing or unparseable
 */
export async function extractParametersFromFile(filePath: string): Promise<ReadonlyArray<ConfigParameter>> {
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch {
    return [];
  }

  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  return findScriptParameters(sourceFile);
}

/**
 * Reports the explicit `envVar` and `cliFlag` that only restate the default.
 *
 * GOScript derives both from `name` (`GOConfigParameter`: `options.envVar ??
 * toEnvironmentKey(name)`), so spelling out the same value adds nothing and
 * silently drifts the day the parameter is renamed. Flags are compared without
 * their leading dashes, since `aws-profile` and `--aws-profile` reach the same
 * parameter.
 *
 * @param parameters - Parameters parsed from a file
 * @returns One entry per redundant property, in declaration order
 *
 * @example
 * ```typescript
 * const redundant = findRedundantOverrides(await extractConfigParameters(scriptPath));
 * ```
 */
export function findRedundantOverrides(parameters: ReadonlyArray<ConfigParameter>): ReadonlyArray<RedundantOverride> {
  const redundant: RedundantOverride[] = [];

  for (const parameter of parameters) {
    const { explicitEnvVar, explicitCliFlag } = parameter;

    if (explicitEnvVar !== undefined && explicitEnvVar === parameter.envVar) {
      redundant.push({
        parameter: parameter.name,
        property: 'envVar',
        value: explicitEnvVar,
        derived: parameter.envVar,
        line: parameter.line,
      });
    }

    if (explicitCliFlag !== undefined && stripDashes(explicitCliFlag) === stripDashes(parameter.cliFlag)) {
      redundant.push({
        parameter: parameter.name,
        property: 'cliFlag',
        value: explicitCliFlag,
        derived: parameter.cliFlag,
        line: parameter.line,
      });
    }
  }

  return redundant;
}

/** Compares flags by what they select, not by how many dashes they were written with. */
function stripDashes(flag: string): string {
  return flag.replace(/^-+/, '');
}

/**
 * Renders redundant overrides as one message line per entry.
 *
 * @param redundant - Overrides reported by `findRedundantOverrides`
 * @returns Human-readable descriptions, ready to be joined
 */
export function describeRedundantOverrides(redundant: ReadonlyArray<RedundantOverride>): ReadonlyArray<string> {
  return redundant.map(
    (entry) =>
      `"${entry.parameter}" restates ${entry.property}: "${entry.value}" is already derived from the name (${entry.derived}) — remove it`,
  );
}
