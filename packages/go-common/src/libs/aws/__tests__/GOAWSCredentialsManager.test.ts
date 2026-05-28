import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOAWSCredentialsErrorType } from '../GOAWSCredentialsError.js';
import { GOAWSCredentialsManager } from '../GOAWSCredentialsManager.js';

describe('GOAWSCredentialsManager', () => {
  it('extracts quoted profile names from credential errors', () => {
    const manager = new GOAWSCredentialsManager();
    const singleQuoted = manager.analyzeError(
      "The SSO session associated with this profile has expired for profile 'dev'",
    );
    const doubleQuoted = manager.analyzeError(
      'The SSO session associated with this profile has expired for profile "prod"',
    );

    assert.strictEqual(singleQuoted.type, GOAWSCredentialsErrorType.SSO_SESSION_EXPIRED);
    assert.strictEqual(singleQuoted.profileName, 'dev');
    assert.strictEqual(doubleQuoted.type, GOAWSCredentialsErrorType.SSO_SESSION_EXPIRED);
    assert.strictEqual(doubleQuoted.profileName, 'prod');
  });

  it('extracts parenthesized profile names from credential errors', () => {
    const manager = new GOAWSCredentialsManager();
    const analysis = manager.analyzeError('The config profile (prod) could not be found');

    assert.strictEqual(analysis.type, GOAWSCredentialsErrorType.PROFILE_NOT_FOUND);
    assert.strictEqual(analysis.profileName, 'prod');
  });

  it('detects simple profile-not-found messages without regex matching', () => {
    const manager = new GOAWSCredentialsManager();
    const analysis = manager.analyzeError('Profile dev could not be found');

    assert.strictEqual(analysis.type, GOAWSCredentialsErrorType.PROFILE_NOT_FOUND);
    assert.strictEqual(analysis.profileName, undefined);
  });

  it('prefers quoted profile names over parenthesized names to preserve legacy behavior', () => {
    const manager = new GOAWSCredentialsManager();
    const analysis = manager.analyzeError(
      "The SSO session associated with this profile has expired for profile (ignored) and profile 'quoted'",
    );

    assert.strictEqual(analysis.type, GOAWSCredentialsErrorType.SSO_SESSION_EXPIRED);
    assert.strictEqual(analysis.profileName, 'quoted');
  });

  it('continues scanning after a malformed delimited profile candidate', () => {
    const manager = new GOAWSCredentialsManager();
    const analysis = manager.analyzeError(
      'The SSO session associated with this profile has expired for profile \'unterminated and profile "prod"',
    );

    assert.strictEqual(analysis.type, GOAWSCredentialsErrorType.SSO_SESSION_EXPIRED);
    assert.strictEqual(analysis.profileName, 'prod');
  });

  it('handles malformed parenthesized profile messages without regex backtracking', () => {
    const manager = new GOAWSCredentialsManager();
    const analysis = manager.analyzeError(
      `The SSO session associated with this profile has expired for profile (${'('.repeat(10_000)}`,
    );

    assert.strictEqual(analysis.type, GOAWSCredentialsErrorType.SSO_SESSION_EXPIRED);
    assert.strictEqual(analysis.profileName, undefined);
  });

  it('handles malformed profile-not-found messages without regex backtracking', () => {
    const manager = new GOAWSCredentialsManager();
    const simpleAnalysis = manager.analyzeError(`Profile ${'profile '.repeat(10_000)}`);
    const configAnalysis = manager.analyzeError(`The config profile (${'the config profile ('.repeat(10_000)}`);

    assert.strictEqual(simpleAnalysis.type, GOAWSCredentialsErrorType.UNKNOWN);
    assert.strictEqual(configAnalysis.type, GOAWSCredentialsErrorType.UNKNOWN);
  });
});
