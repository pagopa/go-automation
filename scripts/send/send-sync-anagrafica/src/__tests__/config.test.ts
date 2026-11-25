/**
 * Test delle dichiarazioni di configurazione.
 *
 * Il test che conta e' l'ultimo: `getConfiguration` ricava ogni property
 * camel-casando il nome puntato del parametro e poi fa un cast **non
 * verificato**. Un campo con il nome sbagliato resta `undefined` per sempre e
 * nessun gate del monorepo se ne accorge — e' successo davvero su
 * `aws-manage-s3`, dove `--object-prefix` era dichiarato e mai letto.
 */

import { GOConfigParameterType } from '@go-automation/go-script';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { scriptParameters } from '../config.js';

import { makeConfig, readShippedConfig } from './fixtures.js';

/** Camel-cases a dotted parameter name the way getConfiguration does. */
function derivedName(parameter: string): string {
  const [head, ...rest] = parameter.split('.');
  return [head, ...rest.map((part) => part.charAt(0).toUpperCase() + part.slice(1))].join('');
}

/** The parameter declared under a given name. */
function parameter(name: string): (typeof scriptParameters)[number] {
  const found = scriptParameters.find((candidate) => candidate.name === name);
  assert.ok(found !== undefined, `parameter '${name}' is not declared`);
  return found;
}

describe('scriptParameters', () => {
  it('requires the checkout, the environment and the profiles', () => {
    for (const name of ['config.path', 'env', 'aws.profiles']) {
      assert.equal(parameter(name).required, true, `${name} must be required`);
    }
  });

  it('takes profiles plural, because nine tables live on core and seven on confinfo', () => {
    assert.equal(parameter('aws.profiles').type, GOConfigParameterType.STRING_ARRAY);
  });

  it('keeps every writing flag off unless it is asked for', () => {
    // The run must be read-only when nobody said otherwise, so a default that
    // drifted to true would turn a comparison into a write.
    for (const name of ['sync', 'yes']) {
      assert.equal(parameter(name).type, GOConfigParameterType.BOOL, `${name} must be a flag`);
      assert.equal(parameter(name).defaultValue, false, `${name} must default to off`);
      assert.notEqual(parameter(name).required, true, `${name} must not be required`);
    }
  });

  it('reads the dry run the go-cli global --dry-run exports', () => {
    // go-cli consumes `--dry-run` itself and only exports GO_DRY_RUN to the
    // script, so without this alias a preview asked for through go-cli would
    // be a real run.
    assert.ok(parameter('dry.run').aliases?.includes('GO_DRY_RUN'));
    assert.equal(parameter('dry.run').defaultValue, false);
  });

  it('declares no flag that deletes', () => {
    // Nothing here removes an item: every request is a put, and items the
    // table holds and no file declares are reported and left alone. This is
    // what notices if a delete is ever added without a decision.
    const deleting = ['delete', 'remove', 'purge', 'prune', 'reconcile'];
    const offenders = scriptParameters
      .map((candidate) => candidate.name)
      .filter((name) => name.split('.').some((segment) => deleting.includes(segment.toLowerCase())));

    assert.deepEqual(offenders, []);
  });

  it('uses initialisms for aliases, never whole words', () => {
    const forbidden = ['name', 'type', 'filter', 'path', 'output', 'queue', 'env', 'table', 'config'];
    for (const candidate of scriptParameters) {
      for (const alias of candidate.aliases ?? []) {
        assert.ok(!forbidden.includes(alias), `alias '${alias}' of ${candidate.name} is a whole word`);
      }
    }
  });

  it('declares every alias exactly once', () => {
    const aliases = scriptParameters.flatMap((candidate) => candidate.aliases ?? []);

    assert.equal(new Set(aliases).size, aliases.length);
  });

  it('gives every resource parameter a shipped value and no default', () => {
    const shipped = readShippedConfig() as unknown as Record<string, Record<string, unknown>>;

    for (const candidate of scriptParameters.filter((entry) => entry.group === 'Resources')) {
      // The marker list only adds to the built-in production signals, so an empty
      // list is the safe baseline and not a resource name hard-coded in code.
      if (candidate.name !== 'guard.prodProfileMarkers') {
        assert.equal(candidate.defaultValue, undefined, `${candidate.name} must not default`);
      }
      const [group, key] = candidate.name.split('.');
      assert.ok(group !== undefined && key !== undefined);
      const section = shipped[group];
      assert.ok(section !== undefined, `config.json has no '${group}' section`);
      assert.ok(key in section, `config.json is missing ${candidate.name}`);
    }
  });

  it('matches every declared parameter to a field of the config type', () => {
    // Derived mechanically from the declarations, so renaming a field without
    // renaming the parameter fails here instead of silently reading undefined.
    const derived = scriptParameters.map((candidate) => derivedName(candidate.name)).sort();
    const fields = Object.keys(makeConfig()).sort();

    assert.deepEqual(derived, fields);
  });
});
