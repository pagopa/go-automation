import * as ts from 'typescript';

interface ExportedClassDeclaration {
  readonly name: string;
  readonly line: number;
}

interface NamedReExportDeclaration {
  readonly exportedName: string;
  readonly sourceName: string;
  readonly moduleSpecifier: string;
  readonly line: number;
}

export function findExportedClassesInAddedLines(
  sourcePath: string,
  sourceText: string,
  addedLines: ReadonlySet<number>,
): ReadonlyArray<ExportedClassDeclaration> {
  const sourceFile = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const exportedNames = collectExportedNames(sourceFile);
  const addedExportedNames = collectExportedNamesOnAddedLines(sourceFile, addedLines);
  const classes: ExportedClassDeclaration[] = [];

  function visit(node: ts.Node): void {
    if (ts.isClassDeclaration(node) && node.name !== undefined && isExportedClass(node, exportedNames)) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      const oneBasedLine = line + 1;
      if (addedLines.has(oneBasedLine)) {
        classes.push({ name: node.name.text, line: oneBasedLine });
        return;
      }

      const exportLine = addedExportedNames.get(node.name.text);
      if (exportLine !== undefined) {
        classes.push({ name: node.name.text, line: exportLine });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return classes;
}

export function findNamedReExportsInAddedLines(
  sourcePath: string,
  sourceText: string,
  addedLines: ReadonlySet<number>,
): ReadonlyArray<NamedReExportDeclaration> {
  const sourceFile = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const reExports: NamedReExportDeclaration[] = [];

  for (const statement of sourceFile.statements) {
    if (
      !ts.isExportDeclaration(statement) ||
      statement.exportClause === undefined ||
      statement.moduleSpecifier === undefined ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !ts.isNamedExports(statement.exportClause)
    ) {
      continue;
    }

    for (const element of statement.exportClause.elements) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(element.getStart(sourceFile));
      const oneBasedLine = line + 1;
      if (!addedLines.has(oneBasedLine)) continue;

      reExports.push({
        exportedName: element.name.text,
        sourceName: element.propertyName?.text ?? element.name.text,
        moduleSpecifier: statement.moduleSpecifier.text,
        line: oneBasedLine,
      });
    }
  }

  return reExports;
}

export function findExportedClassName(
  sourcePath: string,
  sourceText: string,
  exportName: string,
  fallbackName: string,
): string | undefined {
  const sourceFile = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const exportedNames = collectExportedNames(sourceFile);
  const defaultExportName = collectDefaultExportName(sourceFile);

  let className: string | undefined;

  function visit(node: ts.Node): void {
    if (className !== undefined) return;

    if (ts.isClassDeclaration(node)) {
      const declaredName = node.name?.text;
      if (exportName === 'default') {
        if (hasModifier(node, ts.SyntaxKind.DefaultKeyword) || declaredName === defaultExportName) {
          className = declaredName ?? fallbackName;
          return;
        }
      }

      if (declaredName === exportName && isExportedClass(node, exportedNames)) {
        className = declaredName;
        return;
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return className;
}

function collectExportedNames(sourceFile: ts.SourceFile): ReadonlySet<string> {
  const exportedNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause !== undefined &&
      statement.moduleSpecifier === undefined
    ) {
      collectNamedExportNames(statement.exportClause, exportedNames);
      continue;
    }

    if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
      exportedNames.add(statement.expression.text);
    }
  }

  return exportedNames;
}

function collectExportedNamesOnAddedLines(
  sourceFile: ts.SourceFile,
  addedLines: ReadonlySet<number>,
): ReadonlyMap<string, number> {
  const exportedNames = new Map<string, number>();

  for (const statement of sourceFile.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause !== undefined &&
      statement.moduleSpecifier === undefined
    ) {
      collectNamedExportNamesOnAddedLines(sourceFile, statement.exportClause, addedLines, exportedNames);
      continue;
    }

    const { line } = sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile));
    const oneBasedLine = line + 1;
    if (!addedLines.has(oneBasedLine)) continue;

    if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
      exportedNames.set(statement.expression.text, oneBasedLine);
    }
  }

  return exportedNames;
}

function collectDefaultExportName(sourceFile: ts.SourceFile): string | undefined {
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
      return statement.expression.text;
    }
  }

  return undefined;
}

function collectNamedExportNames(exportClause: ts.NamedExportBindings, exportedNames: Set<string>): void {
  if (!ts.isNamedExports(exportClause)) return;

  for (const element of exportClause.elements) {
    exportedNames.add(element.propertyName?.text ?? element.name.text);
  }
}

function collectNamedExportNamesOnAddedLines(
  sourceFile: ts.SourceFile,
  exportClause: ts.NamedExportBindings,
  addedLines: ReadonlySet<number>,
  exportedNames: Map<string, number>,
): void {
  if (!ts.isNamedExports(exportClause)) return;

  for (const element of exportClause.elements) {
    const { line } = sourceFile.getLineAndCharacterOfPosition(element.getStart(sourceFile));
    const oneBasedLine = line + 1;
    if (!addedLines.has(oneBasedLine)) continue;

    const exportedName = element.propertyName?.text ?? element.name.text;
    exportedNames.set(exportedName, oneBasedLine);
  }
}

function isExportedClass(node: ts.ClassDeclaration, exportedNames: ReadonlySet<string>): boolean {
  const isExportedByModifier =
    hasModifier(node, ts.SyntaxKind.ExportKeyword) || hasModifier(node, ts.SyntaxKind.DefaultKeyword);

  return exportedNames.has(node.name?.text ?? '') || isExportedByModifier;
}

function hasModifier(node: ts.ClassDeclaration, kind: ts.SyntaxKind): boolean {
  return node.modifiers?.some((modifier) => modifier.kind === kind) ?? false;
}
