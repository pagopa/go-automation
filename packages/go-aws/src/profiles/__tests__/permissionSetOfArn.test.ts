import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { permissionSetOfArn } from '../permissionSetOfArn.js';

const HASH = '0123456789abcdef';

describe('permissionSetOfArn', () => {
  it('reads the permission set of an SSO session', () => {
    assert.equal(
      permissionSetOfArn(
        `arn:aws:sts::000000000000:assumed-role/AWSReservedSSO_ReadOnlyAccess_${HASH}/user@example.org`,
      ),
      'ReadOnlyAccess',
    );
  });

  it('keeps underscores inside the permission set name and supports other partitions', () => {
    assert.equal(
      permissionSetOfArn(`arn:aws-us-gov:sts::000000000000:assumed-role/AWSReservedSSO_Ops_Read_Only_${HASH}/u`),
      'Ops_Read_Only',
    );
  });

  it('returns undefined for identities that are not SSO sessions', () => {
    for (const arn of [
      'arn:aws:iam::000000000000:user/someone',
      'arn:aws:sts::000000000000:assumed-role/MyRole/session',
      `arn:aws:sts::000000000000:assumed-role/AWSReservedSSO_ReadOnly_nothex0123456789/u`,
      '',
    ]) {
      assert.equal(permissionSetOfArn(arn), undefined, arn);
    }
  });
});
