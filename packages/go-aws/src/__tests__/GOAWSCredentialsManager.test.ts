import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOAWSCredentialsErrorType } from '../GOAWSCredentialsError.js';
import { GOAWSCredentialsManager } from '../GOAWSCredentialsManager.js';

const EXPIRED = 'The SSO session associated with this profile has expired for profile';

describe('GOAWSCredentialsManager.analyzeError', () => {
  it('classifies credential errors and extracts the profile name', () => {
    const cases: ReadonlyArray<readonly [string, GOAWSCredentialsErrorType, string | undefined]> = [
      [`${EXPIRED} 'dev'`, GOAWSCredentialsErrorType.SSO_SESSION_EXPIRED, 'dev'],
      [`${EXPIRED} "prod"`, GOAWSCredentialsErrorType.SSO_SESSION_EXPIRED, 'prod'],
      ['The config profile (prod) could not be found', GOAWSCredentialsErrorType.PROFILE_NOT_FOUND, 'prod'],
      // Detected without regex matching: no delimited name to extract.
      ['Profile dev could not be found', GOAWSCredentialsErrorType.PROFILE_NOT_FOUND, undefined],
      // Quoted names win over parenthesized ones, as they always did.
      [`${EXPIRED} (ignored) and profile 'quoted'`, GOAWSCredentialsErrorType.SSO_SESSION_EXPIRED, 'quoted'],
      // A malformed delimited candidate does not stop the scan.
      [`${EXPIRED} 'unterminated and profile "prod"`, GOAWSCredentialsErrorType.SSO_SESSION_EXPIRED, 'prod'],
    ];
    const manager = new GOAWSCredentialsManager();
    for (const [message, type, profileName] of cases) {
      const analysis = manager.analyzeError(message);
      assert.deepStrictEqual([analysis.type, analysis.profileName], [type, profileName], message);
    }
  });

  it('handles malformed messages without regex backtracking', () => {
    const manager = new GOAWSCredentialsManager();

    const parenthesized = manager.analyzeError(`${EXPIRED} (${'('.repeat(10_000)}`);
    assert.strictEqual(parenthesized.type, GOAWSCredentialsErrorType.SSO_SESSION_EXPIRED);
    assert.strictEqual(parenthesized.profileName, undefined);
    assert.strictEqual(
      manager.analyzeError(`Profile ${'profile '.repeat(10_000)}`).type,
      GOAWSCredentialsErrorType.UNKNOWN,
    );
    assert.strictEqual(
      manager.analyzeError(`The config profile (${'the config profile ('.repeat(10_000)}`).type,
      GOAWSCredentialsErrorType.UNKNOWN,
    );
  });
});
