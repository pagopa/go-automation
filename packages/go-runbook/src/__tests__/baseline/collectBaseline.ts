/**
 * Baseline of the go-runbook reorganization (EVO-RBREORG-OPUS-01 §9.1).
 *
 * Computes, from the current sources, what the reorganization must keep
 * byte-identical while files move: the published descriptors, the canonical
 * JSON of every built runbook, the RTA cache fingerprints and the public
 * surface of every entrypoint. `baseline.test.ts` compares these values with
 * the versioned copy in `src/__baseline__/`; `updateBaseline.ts` rewrites it.
 *
 * Only the entrypoint barrels are imported (`../../index.js`,
 * `../../inventory/index.js`, `../../runtime/index.js`): they keep their path
 * through every phase, so this module does not move with the files it checks.
 */
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import { canonicalizeJson } from '@pagopa/go-common/json';
import { safeJsonStringify } from '@pagopa/go-common/utils';

import { RUNBOOK_CATALOG, RUNBOOK_REGISTRY } from '../../inventory/index.js';
import type { RunbookDescriptor } from '../../inventory/index.js';

/** Entrypoint barrels of the package, by `exports` subpath. */
const ENTRYPOINTS: Readonly<Record<string, string>> = {
  '.': '../../index.ts',
  './output': '../../toolkits/common/output/index.ts',
  './toolkits/common': '../../toolkits/common/index.ts',
  './toolkits/send': '../../toolkits/send/index.ts',
  './toolkits/interop': '../../toolkits/interop/index.ts',
  './inventory': '../../inventory/index.ts',
  './runtime': '../../runtime/index.ts',
};

/** Directory holding the versioned baseline files. */
export const BASELINE_DIR: string = fileURLToPath(new URL('../../__baseline__/', import.meta.url));

/**
 * Descriptors exactly as `catalog:descriptors` publishes them.
 *
 * @returns The sorted descriptors of every registered runbook
 */
export function collectDescriptors(): ReadonlyArray<RunbookDescriptor> {
  return RUNBOOK_CATALOG.listDescriptors();
}

/**
 * Canonical JSON of every built runbook, keyed by descriptor key.
 *
 * The value is the parsed `canonicalizeJson(build())`, so a drift can be
 * diffed field by field; parsing a canonical string and canonicalizing it again
 * yields the same string.
 *
 * @returns Canonical runbook objects by key
 */
export function collectCanonicalRunbooks(): Readonly<Record<string, unknown>> {
  const canonical: Record<string, unknown> = {};
  for (const descriptor of RUNBOOK_CATALOG.listDescriptors()) {
    const resolved = RUNBOOK_CATALOG.resolveByKey(descriptor.key);
    if (resolved === undefined) {
      throw new Error(`Baseline: runbook ${descriptor.key} listed but not resolvable`);
    }
    canonical[descriptor.key] = JSON.parse(canonicalizeJson(resolved.build())) as unknown;
  }
  return canonical;
}

/**
 * RTA resume-cache fingerprint of every built runbook, keyed by alarm name.
 *
 * Same formula as `go-watchtower-runbook/src/cache/runbookFingerprint.ts`:
 * it depends on field insertion order, which `definitionDigest` ignores.
 *
 * @returns Fingerprints by alarm name
 */
export function collectFingerprints(): Readonly<Record<string, string>> {
  const fingerprints: Record<string, string> = {};
  for (const alarmName of [...RUNBOOK_REGISTRY.keys()].sort()) {
    const build = RUNBOOK_REGISTRY.get(alarmName);
    if (build === undefined) continue;
    const serialized = safeJsonStringify(build(), { maxDepth: 64 });
    fingerprints[alarmName] = createHash('sha256').update(serialized).digest('hex');
  }
  return fingerprints;
}

/**
 * Public surface of every entrypoint, including namespace members and the
 * public members of exported classes.
 *
 * Each entry is `<path> (<value|type|namespace>)`; class members are
 * `<Class>#<member>` (instance) or `<Class>.<member>` (static).
 *
 * @returns Sorted surface lines by entrypoint
 */
export function collectSurface(): Readonly<Record<string, ReadonlyArray<string>>> {
  const files = Object.fromEntries(
    Object.entries(ENTRYPOINTS).map(([entry, relative]) => [entry, fileURLToPath(new URL(relative, import.meta.url))]),
  );
  const program = ts.createProgram(Object.values(files), {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    skipLibCheck: true,
    noEmit: true,
  });
  const checker = program.getTypeChecker();
  const surface: Record<string, ReadonlyArray<string>> = {};
  for (const [entry, file] of Object.entries(files)) {
    const sourceFile = program.getSourceFile(file);
    const moduleSymbol = sourceFile === undefined ? undefined : checker.getSymbolAtLocation(sourceFile);
    if (moduleSymbol === undefined) {
      throw new Error(`Baseline: cannot read entrypoint ${entry} (${file})`);
    }
    const lines: string[] = [];
    collectModuleExports(checker, moduleSymbol, '', lines);
    surface[entry] = [...new Set(lines)].sort();
  }
  return surface;
}

function collectModuleExports(checker: ts.TypeChecker, moduleSymbol: ts.Symbol, prefix: string, lines: string[]): void {
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const target = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    const name = `${prefix}${exported.name}`;
    if (target.flags & ts.SymbolFlags.ValueModule) {
      lines.push(`${name} (namespace)`);
      collectModuleExports(checker, target, `${name}.`, lines);
      continue;
    }
    lines.push(`${name} (${target.flags & ts.SymbolFlags.Value ? 'value' : 'type'})`);
    if (target.flags & ts.SymbolFlags.Class) {
      collectClassMembers(checker, target, name, lines);
    }
  }
}

/**
 * Public members of a class, inherited ones included: a class that stops
 * extending its base loses public API even when its own declarations stay.
 * Members declared by the TypeScript default library (e.g. `Error#stack`) are left out.
 */
function collectClassMembers(
  checker: ts.TypeChecker,
  classSymbol: ts.Symbol,
  className: string,
  lines: string[],
): void {
  const instanceType = checker.getDeclaredTypeOfSymbol(classSymbol);
  const staticType = checker.getTypeOfSymbol(classSymbol);
  for (const [members, separator] of [
    [checker.getPropertiesOfType(instanceType), '#'],
    [checker.getPropertiesOfType(staticType).filter((member) => member.name !== 'prototype'), '.'],
  ] as const) {
    for (const member of members) {
      if (isPublicLibraryMember(member)) lines.push(`${className}${separator}${member.name}`);
    }
  }
}

function isPublicLibraryMember(member: ts.Symbol): boolean {
  const declaration = member.valueDeclaration ?? member.getDeclarations()?.[0];
  if (declaration === undefined) return false;
  if (/[\\/]typescript[\\/]lib[\\/]/u.test(declaration.getSourceFile().fileName)) return false;
  const name = ts.getNameOfDeclaration(declaration);
  if (name !== undefined && ts.isPrivateIdentifier(name)) return false;
  return (ts.getCombinedModifierFlags(declaration) & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) === 0;
}
