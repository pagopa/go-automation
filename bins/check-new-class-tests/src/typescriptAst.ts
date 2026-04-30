import * as ts from 'typescript';

interface ExportedClassDeclaration {
  readonly name: string;
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

function collectExportedNames(sourceFile: ts.SourceFile): ReadonlySet<string> {
  const exportedNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement) && statement.exportClause !== undefined) {
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
    if (ts.isExportDeclaration(statement) && statement.exportClause !== undefined) {
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
    node.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword || modifier.kind === ts.SyntaxKind.DefaultKeyword,
    ) ?? false;

  return exportedNames.has(node.name?.text ?? '') || isExportedByModifier;
}
