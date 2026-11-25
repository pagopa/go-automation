import * as path from 'node:path';
import ts from 'typescript';

import type { ValueProbeRequest } from './types/ValueProbeRequest.js';

/**
 * Which exports a consumer can use as **runtime values**, decided by the compiler itself: for each
 * entrypoint a probe module does `import * as api from '<entrypoint>'` and reads `api.<name>` in value
 * position, one name per line. A line without diagnostics is a value; any diagnostic (an interface, a
 * type alias, a symbol reached through `export type { }`, `export type *` or `export type * as`) makes it
 * type-only. Every forwarding path is therefore classified exactly as consumers see it, competing value
 * re-exports included.
 *
 * @param requests - One request per entrypoint of the same package
 * @param options - Compiler options (NodeNext)
 * @returns For each request, in order, the names that are runtime values
 * @throws Error when a probe cannot import its entrypoint
 */
export function probeValueExports(
  requests: ReadonlyArray<ValueProbeRequest>,
  options: ts.CompilerOptions,
): ReadonlyArray<ReadonlySet<string>> {
  const probes = requests.map((request, index) => ({
    request,
    file: path.join(path.dirname(request.typesFile), `__api_value_probe_${String(index)}.ts`),
    text: [
      `import * as api from './${path.basename(request.typesFile).replace(/\.d\.ts$/u, '.js')}';`,
      ...request.names.map((name) => `void api.${name};`),
    ].join('\n'),
  }));
  const virtual = new Map(probes.map((probe) => [probe.file, probe.text]));
  const host = ts.createCompilerHost(options);
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const getSourceFile = host.getSourceFile.bind(host);
  host.readFile = (file): string | undefined => virtual.get(file) ?? readFile(file);
  host.fileExists = (file): boolean => virtual.has(file) || fileExists(file);
  host.getSourceFile = (file, languageVersion, onError, shouldCreate): ts.SourceFile | undefined => {
    const text = virtual.get(file);
    return text === undefined
      ? getSourceFile(file, languageVersion, onError, shouldCreate)
      : ts.createSourceFile(file, text, languageVersion, true);
  };
  const program = ts.createProgram(
    probes.map((probe) => probe.file),
    options,
    host,
  );
  return probes.map((probe) => {
    const sourceFile = program.getSourceFile(probe.file);
    if (sourceFile === undefined) throw new Error(`value probe for ${probe.request.typesFile} was not loaded`);
    const failingLines = new Set(
      program
        .getSemanticDiagnostics(sourceFile)
        .map((diagnostic) => sourceFile.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line),
    );
    if (failingLines.has(0)) throw new Error(`value probe cannot import ${probe.request.typesFile}`);
    return new Set(probe.request.names.filter((_, index) => !failingLines.has(index + 1)));
  });
}
