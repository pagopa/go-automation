import * as path from 'node:path';
import ts from 'typescript';

import { reportName } from './listEntrypoints.js';
import type { PublishedEntrypoint } from './types/PublishedEntrypoint.js';

/** A rendered report and the package declarations its public symbols reference. */
export interface RenderedReport {
  readonly entrypoint: PublishedEntrypoint;
  readonly fileName: string;
  /** Report body without the "not exported" section, which needs every entrypoint of the package. */
  readonly body: string;
  /** Declarations exported by this entrypoint (resolved, aliases followed). */
  readonly exportedDeclarations: ReadonlySet<ts.Declaration>;
  /** Package declarations the exported ones reach, transitively: declaration → label. */
  readonly referencedDeclarations: ReadonlyMap<ts.Declaration, string>;
}

const PRINTER = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });

/**
 * Qualified names of everything an entrypoint exports, namespaces expanded (`apigw`,
 * `apigw.ParseApiGwErrorsStep`), in the order of the report: the input of the value probe.
 *
 * @param entrypoint - The entrypoint
 * @param program - A program that includes its `types` file
 * @returns The qualified names
 */
export function exportedNames(entrypoint: PublishedEntrypoint, program: ts.Program): ReadonlyArray<string> {
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(entrypoint.typesFile);
  const moduleSymbol = sourceFile === undefined ? undefined : checker.getSymbolAtLocation(sourceFile);
  if (moduleSymbol === undefined)
    throw new Error(`${entrypoint.typesFile} is not a module of the program (build first)`);
  const names: string[] = [];
  const walk = (symbol: ts.Symbol, prefix: string): void => {
    for (const exported of checker.getExportsOfModule(symbol)) {
      const resolved = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      const qualifiedName = `${prefix}${exported.name}`;
      names.push(qualifiedName);
      if ((resolved.declarations ?? []).some((declaration) => ts.isSourceFile(declaration))) {
        walk(resolved, `${qualifiedName}.`);
      }
    }
  };
  walk(moduleSymbol, '');
  return names;
}

/**
 * Renders the API report of one entrypoint from its compiled `.d.ts`: every exported symbol with its
 * declaration as a consumer sees it, sorted by name; namespaces re-exported with `export * as`
 * are expanded. Comments are dropped: only the shape is part of the contract (EVO-PKGPUB-OPUS-01 §10.3).
 *
 * @param entrypoint - The entrypoint
 * @param program - A program that includes its `types` file
 * @param valueExports - Qualified names a consumer can use as runtime values ({@link probeValueExports})
 * @returns The rendered report
 */
export function renderApiReport(
  entrypoint: PublishedEntrypoint,
  program: ts.Program,
  valueExports: ReadonlySet<string>,
): RenderedReport {
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(entrypoint.typesFile);
  if (sourceFile === undefined) throw new Error(`${entrypoint.typesFile} is not in the program (build first)`);
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (moduleSymbol === undefined) throw new Error(`${entrypoint.typesFile} is not a module`);

  const exportedDeclarations = new Set<ts.Declaration>();
  const referencedDeclarations = new Map<ts.Declaration, string>();
  const lines: string[] = [];
  const distRoot = path.join(entrypoint.packageDirectory, 'dist');

  const renderModule = (symbol: ts.Symbol, prefix: string): void => {
    const exports = [...checker.getExportsOfModule(symbol)].sort((left, right) => left.name.localeCompare(right.name));
    for (const exported of exports) {
      const resolved = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      const qualifiedName = `${prefix}${exported.name}`;
      const declarations = resolved.declarations ?? [];
      const kind = valueExports.has(qualifiedName) ? 'value' : 'type';
      if (declarations.some((declaration) => ts.isSourceFile(declaration))) {
        lines.push(`## namespace \`${qualifiedName}\` (${kind})`, '');
        renderModule(resolved, `${qualifiedName}.`);
        continue;
      }
      lines.push(`### \`${qualifiedName}\` (${kind})`, '', '```ts');
      for (const declaration of declarations) {
        exportedDeclarations.add(declaration);
        lines.push(printDeclaration(declaration));
        collectReferences(declaration, checker, distRoot, referencedDeclarations);
      }
      lines.push('```', '');
    }
  };
  renderModule(moduleSymbol, '');

  // Close the references transitively: a type reached only through another non-exported type is
  // still part of the contract (its shape is printed by finalizeReports when no entrypoint exports it).
  const pending = [...referencedDeclarations.keys()];
  const visited = new Set<ts.Declaration>(exportedDeclarations);
  for (let declaration = pending.pop(); declaration !== undefined; declaration = pending.pop()) {
    if (visited.has(declaration)) continue;
    visited.add(declaration);
    const before = new Set(referencedDeclarations.keys());
    collectReferences(declaration, checker, distRoot, referencedDeclarations);
    for (const added of referencedDeclarations.keys()) if (!before.has(added)) pending.push(added);
  }

  const specifierText =
    entrypoint.subpath === '.' ? entrypoint.packageName : `${entrypoint.packageName}/${entrypoint.subpath.slice(2)}`;
  const header = [
    `# API report: \`${specifierText}\``,
    '',
    '> Generated by `pnpm api:report:update` from the compiled `.d.ts` (EVO-PKGPUB-OPUS-01 §10.3). Do not edit by hand.',
    '',
  ];
  return {
    entrypoint,
    fileName: `${reportName(entrypoint.subpath)}.api.md`,
    body: [...header, ...lines].join('\n'),
    exportedDeclarations,
    referencedDeclarations,
  };
}

/** One declaration as text: variables keep their `const`, everything else is printed as declared. */
function printDeclaration(declaration: ts.Declaration): string {
  const sourceFile = declaration.getSourceFile();
  if (ts.isVariableDeclaration(declaration)) {
    return `const ${PRINTER.printNode(ts.EmitHint.Unspecified, declaration, sourceFile)};`;
  }
  return PRINTER.printNode(ts.EmitHint.Unspecified, declaration, sourceFile);
}

/** Declarations of this package that a type reference in `declaration` points to. */
function collectReferences(
  declaration: ts.Node,
  checker: ts.TypeChecker,
  distRoot: string,
  referenced: Map<ts.Declaration, string>,
): void {
  const visit = (node: ts.Node): void => {
    const name = ts.isTypeReferenceNode(node)
      ? node.typeName
      : ts.isExpressionWithTypeArguments(node)
        ? node.expression
        : ts.isTypeQueryNode(node)
          ? node.exprName
          : undefined;
    if (name !== undefined) {
      const symbol = checker.getSymbolAtLocation(name);
      const target =
        symbol !== undefined && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      for (const targetDeclaration of target?.declarations ?? []) {
        const file = targetDeclaration.getSourceFile().fileName;
        if (file.startsWith(distRoot) && !ts.isTypeParameterDeclaration(targetDeclaration)) {
          referenced.set(targetDeclaration, `${target?.name ?? '?'} (${path.relative(path.dirname(distRoot), file)})`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(declaration);
}

/**
 * Completes the reports of one package with the referenced declarations no entrypoint exports:
 * a public symbol that uses them exposes a type consumers cannot name (EVO-PKGPUB-OPUS-01 §10.3).
 *
 * @param reports - All reports of one package
 * @returns File name → final report text
 */
export function finalizeReports(reports: ReadonlyArray<RenderedReport>): ReadonlyMap<string, string> {
  const exportedAnywhere = new Set<ts.Declaration>();
  for (const report of reports)
    for (const declaration of report.exportedDeclarations) exportedAnywhere.add(declaration);
  return new Map(
    reports.map((report) => {
      // Group the declarations nobody exports by label; print their shape, so a change to them
      // (for example a property becoming optional) changes the report.
      const notExported = new Map<string, string[]>();
      for (const [declaration, label] of report.referencedDeclarations) {
        if (exportedAnywhere.has(declaration)) continue;
        notExported.set(label, [...(notExported.get(label) ?? []), printDeclaration(declaration)]);
      }
      const labels = [...notExported.keys()].sort();
      const section =
        labels.length === 0
          ? ['## Referenced but not exported', '', 'None.', '']
          : [
              '## Referenced but not exported',
              '',
              'Package types used by the symbols above that no entrypoint exports. Export them or make them internal before `1.0.0`.',
              '',
              ...labels.flatMap((label) => [
                `### \`${label.split(' (')[0] ?? label}\` (${label.slice(label.indexOf('(') + 1, -1)})`,
                '',
                '```ts',
                ...[...new Set(notExported.get(label) ?? [])].sort(),
                '```',
                '',
              ]),
            ];
      return [report.fileName, `${report.body}\n${section.join('\n')}`];
    }),
  );
}
