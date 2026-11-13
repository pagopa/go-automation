import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { scrubAwsProfileNames } from '../scrubAwsProfileNames.js';

describe('scrubAwsProfileNames', () => {
  it('removes go-aws profile suffixes, configured-profile lists and known names', () => {
    assert.equal(
      scrubAwsProfileNames('CloudWatch Logs StartQuery access denied (queryId: q-1) (profile: team-reader)'),
      'CloudWatch Logs StartQuery access denied (queryId: q-1)',
    );
    assert.equal(
      scrubAwsProfileNames('No configured AWS profile resolves to account 000000000000. Configured profiles: a, b'),
      'No configured AWS profile resolves to account 000000000000. Configured profiles: <omitted>',
    );
    assert.equal(
      scrubAwsProfileNames('could not be resolved — team-reader: ExpiredToken', ['team-reader', 'team']),
      'could not be resolved — <profile>: ExpiredToken',
    );
  });

  it('replaces known names only as whole tokens, keeping the text that classifies failures', () => {
    assert.equal(
      scrubAwsProfileNames('CloudWatch Logs StartQuery access denied (profile: a)', ['a']),
      'CloudWatch Logs StartQuery access denied',
    );
    assert.equal(scrubAwsProfileNames('a: ExpiredToken; data loaded', ['a']), '<profile>: ExpiredToken; data loaded');
  });

  it('removes the profile embedded by the SDK credential providers and by go-aws identity errors', () => {
    assert.equal(
      scrubAwsProfileNames(
        'Could not resolve credentials using profile: [monitoring-x] in configuration/credentials file(s). (profile: monitoring-x)',
      ),
      'Could not resolve credentials using profile: [<profile>] in configuration/credentials file(s).',
    );
    assert.equal(
      scrubAwsProfileNames("GetCallerIdentity returned no account id for profile 'monitoring-x'"),
      "GetCallerIdentity returned no account id for profile '<profile>'",
    );
  });
});
