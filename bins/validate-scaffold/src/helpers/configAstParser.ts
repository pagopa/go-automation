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
  /** Alias flags (e.g. ['-sd']) */
  readonly aliases: ReadonlyArray<string>;
  /** Whether the parameter is required */
  readonly required: boolean;
}

/**
 * Converts a dot-notation parameter name to CLI flag format.
 * Examples: 'start.date' → '--start-date', 'aws.profile' → '--aws-profile'
 */
function toCliFlag(name: string): string {
  return `--${name.replace(/\./g, '-')}`;
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
function getStringArray(node: ts.Node): ReadonlyArray<string> {
  if (!ts.isArrayLiteralExpression(node)) return [];
  const result: string[] = [];
  for (const element of node.elements) {
    const value = getStringLiteral(element);
    if (value !== undefined) {
      result.push(value);
    }
  }
  return result;
}

/**
 * Parses a single parameter object literal from the AST.
 */
function parseParameterObject(obj: ts.ObjectLiteralExpression): ConfigParameter | undefined {
  const nameNode = getPropertyNode(obj, 'name');
  if (nameNode === undefined) return undefined;

  const name = getStringLiteral(nameNode);
  if (name === undefined) return undefined;

  const requiredNode = getPropertyNode(obj, 'required');
  const required = requiredNode !== undefined ? (getBooleanLiteral(requiredNode) ?? false) : false;

  const aliasesNode = getPropertyNode(obj, 'aliases');
  const rawAliases = aliasesNode !== undefined ? getStringArray(aliasesNode) : [];
  const aliases = rawAliases.map((a) => (a.length === 1 ? `-${a}` : `--${a}`));

  return {
    name,
    cliFlag: toCliFlag(name),
    aliases,
    required,
  };
}

/**
 * Finds the `scriptParameters` variable declaration in the AST
 * and extracts all parameter objects from its array initializer.
 */
function findScriptParameters(sourceFile: ts.SourceFile): ReadonlyArray<ConfigParameter> {
  const parameters: ConfigParameter[] = [];

  function visit(node: ts.Node): void {
    // Look for: export const scriptParameters = [ ... ]
    if (ts.isVariableStatement(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === 'scriptParameters' && decl.initializer) {
          let arrayNode = decl.initializer;

          // Handle `[ ... ] as const` expression
          if (ts.isAsExpression(arrayNode)) {
            arrayNode = arrayNode.expression;
          }

          if (ts.isArrayLiteralExpression(arrayNode)) {
            for (const element of arrayNode.elements) {
              if (ts.isObjectLiteralExpression(element)) {
                const param = parseParameterObject(element);
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
  const configPath = path.join(scriptPath, 'src', 'config.ts');

  let content: string;
  try {
    content = await fs.readFile(configPath, 'utf-8');
  } catch {
    return [];
  }

  const sourceFile = ts.createSourceFile(configPath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  return findScriptParameters(sourceFile);
}
