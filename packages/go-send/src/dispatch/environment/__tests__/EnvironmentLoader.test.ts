import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import { DispatchError } from '../../DispatchError.js';
import type { DispatchGroup } from '../../model/DispatchGroup.js';
import type { GroupsFetchFn } from '../GroupsFetchFn.js';
import { httpError } from '../../__tests__/helpers/FakeB2BApi.js';
import { tempDir, writeFixture } from '../../__tests__/helpers/testFiles.js';
import { apiKeyFingerprint } from '../apiKeyFingerprint.js';
import { EnvironmentLoader } from '../EnvironmentLoader.js';
import { normalizeBasePath, parseEnvironmentsFile, parseSharedDocument } from '../parseEnvironmentsFile.js';
import { assertProductionCoherence, runEnvironmentPreflight } from '../runEnvironmentPreflight.js';

const SHA = 'XwRVE/PUU1TEi9r3Pmq2KEkmQ2yr7ge8jUDQKPL0e/Y=';

const YAML = `
environments:
  sappada-hotfix:
    description: Comune di Sappada — HOTFIX
    basePath: api.hotfix.notifichedigitali.it
    apiKey: \${PN_API_KEY_SAPPADA_HOTFIX}
    groupId: group-1
    awsProfile: sso_pn-core-hotfix
    sender:
      taxId: '00000000001'
      denomination: Comune di Sappada
    defaults:
      recipient.type: PF
      notificationOptions.paFee: 100
      documents.shared:
        files: [./documenti/atto.pdf]
        title: Atto
  como-uat:
    basePath: https://api.uat.notifichedigitali.it/
    apiKey: \${PN_API_KEY_COMO_UAT}
    defaults:
      documents.shared:
        reference: { key: PN_NOTIFICATION_ATTACHMENTS-x.pdf, versionToken: v1, sha256: '${SHA}' }
`;

async function writeFile(name: string, content: string): Promise<string> {
  const dir = await tempDir('dispatch-env');
  const file = path.join(dir, name);
  await writeFixture(file, content);
  return file;
}

describe('EnvironmentLoader', () => {
  it('loads YAML, normalizes base paths and resolves only the selected API key', async () => {
    const file = await writeFile('environments.yaml', YAML);
    const loader = new EnvironmentLoader((name) =>
      name === 'PN_API_KEY_SAPPADA_HOTFIX' ? 'secret-key-1234' : undefined,
    );
    const environments = await loader.load(file);

    const sappada = loader.resolve(environments, 'sappada-hotfix');
    assert.equal(sappada.basePath, 'https://api.hotfix.notifichedigitali.it');
    assert.equal(sappada.apiKey, 'secret-key-1234');
    assert.equal(sappada.sender?.taxId, '00000000001');
    assert.equal(sappada.defaults.get('notificationOptions.paFee'), '100');
    assert.deepEqual(sappada.sharedDocument, {
      files: [path.join(path.dirname(file), 'documenti/atto.pdf')],
      title: 'Atto',
    });

    const como = environments.environments.get('como-uat');
    assert.equal(como?.basePath, 'https://api.uat.notifichedigitali.it');
    assert.equal(como?.sharedDocument?.reference?.key, 'PN_NOTIFICATION_ATTACHMENTS-x.pdf');
  });

  it('names the missing variable, never a value', async () => {
    const file = await writeFile('environments.yaml', YAML);
    const loader = new EnvironmentLoader(() => undefined);
    const environments = await loader.load(file);
    assert.throws(() => loader.resolve(environments, 'como-uat'), /PN_API_KEY_COMO_UAT is not set/);
    assert.throws(() => loader.resolve(environments, 'nope'), /not found.*available: sappada-hotfix, como-uat/);
  });

  it('loads JSON files too', async () => {
    const file = await writeFile(
      'environments.json',
      JSON.stringify({ environments: { t: { basePath: 'h', apiKey: '${K}' } } }),
    );
    const environments = await new EnvironmentLoader(() => 'k').load(file);
    assert.equal(environments.environments.get('t')?.basePath, 'https://h');
  });
});

describe('parseEnvironmentsFile', () => {
  const env = (fields: Record<string, unknown>): unknown => ({
    environments: { e: { basePath: 'h', apiKey: '${K}', ...fields } },
  });

  it('rejects a literal API key', () => {
    assert.throws(() => parseEnvironmentsFile(env({ apiKey: 'abc123' }), 'f'), /literal API keys are not accepted/);
  });

  it('rejects unquoted codes that YAML turns into numbers', () => {
    assert.throws(
      () => parseEnvironmentsFile(env({ sender: { taxId: 1, denomination: 'Comune' } }), 'f'),
      /write the value in quotes/,
    );
    assert.throws(() => parseEnvironmentsFile(env({ defaults: { 'physicalAddress.zip': 100 } }), 'f'), /in quotes/);
  });

  it('rejects unknown keys and unknown default fields', () => {
    assert.throws(() => parseEnvironmentsFile(env({ groupID: 'x' }), 'f'), /unknown key "groupID"/);
    assert.throws(() => parseEnvironmentsFile(env({ defaults: { 'recipient.tipo': 'PF' } }), 'f'), /unknown field/);
  });

  it('requires exactly one of files and reference for the shared document', () => {
    assert.throws(
      () =>
        parseEnvironmentsFile(
          env({
            defaults: {
              'documents.shared': { files: ['a.pdf'], reference: { key: 'k', versionToken: 'v', sha256: 's' } },
            },
          }),
          'f',
        ),
      /exactly one of "files" and "reference"/,
    );
  });
});

describe('parseSharedDocument reference', () => {
  const reference = (fields: Record<string, unknown>): unknown => ({
    reference: { key: 'PN_NOTIFICATION_ATTACHMENTS-x.pdf', versionToken: 'v1', sha256: SHA, ...fields },
  });

  it('accepts a valid reference, trimming its strings', () => {
    assert.deepEqual(parseSharedDocument(reference({ key: ' k.pdf ', title: ' Atto ' }), 'w', '/base'), {
      reference: { key: 'k.pdf', versionToken: 'v1', sha256: SHA, title: 'Atto' },
    });
  });

  it('checks the sha256 format at load time', () => {
    for (const sha256 of ['abc', `${SHA}=`, SHA.replace('=', 'A'), 42]) {
      assert.throws(
        () => parseSharedDocument(reference({ sha256 }), 'w', '/base'),
        /w\.reference\.sha256: must be a/,
        String(sha256),
      );
    }
  });

  it('checks the versionToken at load time', () => {
    assert.throws(
      () => parseSharedDocument(reference({ versionToken: ' ' }), 'w', '/base'),
      /versionToken: must be a non-empty string/,
    );
    assert.throws(
      () => parseSharedDocument(reference({ versionToken: 1 }), 'w', '/base'),
      /versionToken: write the value in quotes/,
    );
    assert.throws(
      () => parseSharedDocument(reference({ versionToken: 'v'.repeat(257) }), 'w', '/base'),
      /versionToken: exceeds 256 characters/,
    );
    assert.throws(
      () => parseSharedDocument(reference({ versionToken: undefined }), 'w', '/base'),
      /versionToken: must be a non-empty string/,
    );
  });

  it('requires a non-empty list of non-blank file paths', () => {
    assert.throws(() => parseSharedDocument({ files: [] }, 'w', '/base'), /w\.files: must be a non-empty list/);
    assert.throws(() => parseSharedDocument({ files: 'a.pdf' }, 'w', '/base'), /w\.files: must be an array of strings/);
    assert.throws(
      () => parseSharedDocument({ files: ['a.pdf', ' '] }, 'w', '/base'),
      /w\.files\[1\]: must be a non-empty string/,
    );
    assert.deepEqual(parseSharedDocument({ files: [' a.pdf '] }, 'w', '/base'), { files: ['/base/a.pdf'] });
  });
});

describe('normalizeBasePath', () => {
  it('adds the scheme and drops trailing slashes', () => {
    assert.equal(normalizeBasePath('api.uat.notifichedigitali.it/'), 'https://api.uat.notifichedigitali.it');
    assert.equal(normalizeBasePath(' http://localhost:8080// '), 'http://localhost:8080');
  });

  it('rejects malformed hosts with a clear message', () => {
    assert.throws(() => normalizeBasePath('api uat.it'), /^Error: basePath: "api uat\.it" is not a valid host or URL/);
    assert.throws(() => normalizeBasePath('https://'), /is not a valid host or URL/);
    assert.throws(
      () => parseEnvironmentsFile({ environments: { e: { basePath: 'a b', apiKey: '${K}' } } }, 'f'),
      /f: environments\.e\.basePath: "a b" is not a valid host or URL/,
    );
  });
});

describe('parseEnvironmentsFile (direct environments)', () => {
  const directEnv = {
    mode: 'direct',
    description: 'Consolidatore TEST',
    ecBaseUrl: 'http://localhost:8888',
    sender: { taxId: '00000000001', denomination: 'Ente' },
    defaults: { 'direct.aar.key': 'PN_AAR-1.pdf' },
    tunnel: {
      awsProfile: 'sso_pn-confinfo-test',
      target: 'i-065a7d9f4a91add01',
      remoteHost: 'internal-EcsA-1.eu-south-1.elb.amazonaws.com',
      remotePort: 8080,
      localPort: 8888,
    },
  };
  const parse = (direct: Record<string, unknown>): ReturnType<typeof parseEnvironmentsFile> =>
    parseEnvironmentsFile({ environments: { 'ente-test': { basePath: 'h', apiKey: '${K}' }, cons: direct } }, 'f');

  it('keeps direct environments apart from the e2e ones', () => {
    const file = parse(directEnv);
    assert.deepEqual([...file.environments.keys()], ['ente-test']);
    const cons = file.directEnvironments.get('cons');
    assert.equal(cons?.ecBaseUrl, 'http://localhost:8888');
    assert.equal(cons?.tunnel?.target, 'i-065a7d9f4a91add01');
    assert.equal(cons?.tunnel?.remotePort, 8080);
    assert.equal(cons?.defaults.get('direct.aar.key'), 'PN_AAR-1.pdf');
    assert.equal(cons?.production, false);
  });

  it('accepts a direct environment without tunnel (opened by the operator)', () => {
    const { tunnel: _tunnel, ...withoutTunnel } = directEnv;
    assert.equal(parse(withoutTunnel).directEnvironments.get('cons')?.tunnel, undefined);
  });

  it('rejects a tunnel whose local end is not ecBaseUrl, and malformed tunnel values', () => {
    assert.throws(() => parse({ ...directEnv, ecBaseUrl: 'http://localhost:9999' }), /local end of the tunnel/);
    assert.throws(() => parse({ ...directEnv, ecBaseUrl: 'http://10.0.0.1:8888' }), /local end of the tunnel/);
    assert.throws(() => parse({ ...directEnv, tunnel: { ...directEnv.tunnel, target: 'bastion' } }), /EC2 instance id/);
    assert.throws(() => parse({ ...directEnv, tunnel: { ...directEnv.tunnel, remotePort: '8080' } }), /port number/);
    assert.throws(() => parse({ ...directEnv, tunnel: { ...directEnv.tunnel, port: 1 } }), /unknown key "port"/);
  });

  it('rejects e2e-only settings, a shared document and an unknown mode', () => {
    assert.throws(() => parse({ ...directEnv, apiKey: '${K}' }), /unknown key "apiKey"/);
    assert.throws(
      () => parse({ ...directEnv, defaults: { 'documents.shared': { reference: {} } } }),
      /not available in direct mode/,
    );
    assert.throws(() => parse({ ...directEnv, mode: 'fax' }), /must be e2e or direct/);
    assert.throws(() => parse({ ...directEnv, ecBaseUrl: 'localhost:8888' }), /include the scheme/);
  });
});

describe('runEnvironmentPreflight', () => {
  const input = { basePath: 'https://api.test.notifichedigitali.it', production: false, groupId: 'group-1' };
  const groups =
    (list: ReadonlyArray<DispatchGroup>): GroupsFetchFn =>
    async () => {
      await Promise.resolve();
      return list;
    };
  const rejecting: GroupsFetchFn = async () => {
    await Promise.resolve();
    throw httpError(401);
  };
  const code = async (fetch: GroupsFetchFn): Promise<string> =>
    runEnvironmentPreflight(input, fetch).then(
      () => 'ok',
      (error: unknown) => (error instanceof DispatchError ? error.code : String(error)),
    );

  it('returns the group to send on behalf of', async () => {
    const report = await runEnvironmentPreflight(input, groups([{ id: 'group-1', name: 'Ente', status: 'ACTIVE' }]));
    assert.equal(report.group?.name, 'Ente');
    assert.deepEqual(report.warnings, []);
  });

  it('stops on rejected API key, unknown or suspended group', async () => {
    assert.equal(await code(rejecting), 'API_KEY_REJECTED');
    assert.equal(await code(groups([{ id: 'other', name: 'X', status: 'ACTIVE' }])), 'GROUP_NOT_FOUND');
    assert.equal(await code(groups([{ id: 'group-1', name: 'X', status: 'SUSPENDED' }])), 'GROUP_NOT_ACTIVE');
  });

  it('warns when no group is set but the PA has active groups', async () => {
    const { groupId: _groupId, ...withoutGroup } = input;
    const report = await runEnvironmentPreflight(withoutGroup, groups([{ id: 'g', name: 'G', status: 'ACTIVE' }]));
    assert.equal(report.warnings.length, 1);
  });

  it('reports a malformed base path as a DispatchError', () => {
    assert.throws(
      () => assertProductionCoherence({ basePath: 'not a url', production: false }),
      (error: unknown) => error instanceof DispatchError && error.code === 'INVALID_BASE_PATH',
    );
  });

  it('stops on a production host without production: true', () => {
    assert.throws(
      () => assertProductionCoherence({ basePath: 'https://api.notifichedigitali.it', production: false }),
      (error: unknown) => error instanceof DispatchError && error.code === 'PRODUCTION_HOST',
    );
    assert.equal(
      assertProductionCoherence({ basePath: 'https://api.notifichedigitali.it', production: true }),
      'api.notifichedigitali.it',
    );
  });
});

describe('apiKeyFingerprint', () => {
  it('shows only the last 4 characters', () => {
    assert.equal(apiKeyFingerprint('abcdefghijkl1234'), '…1234');
    assert.equal(apiKeyFingerprint('short'), '…');
  });
});
