import type { SensitiveDataConfig } from '../types/SensitiveDataConfig.js';

/** A fake, non-synthetic account id: the decoy every check must catch. */
export const DECOY_ACCOUNT_ID = '987654321098';

/** The repository rules, with one known profile name. */
export const CONFIG: SensitiveDataConfig = {
  allowedAccountIds: [
    { value: '000000000000', reason: 'synthetic' },
    { value: '123456789012', reason: 'AWS documentation' },
  ],
  profileNames: ['my-known-profile'],
  profilePrefixes: ['sso_'],
  forbiddenPathSegments: ['__tests__', '__baseline__'],
  forbiddenSuffixes: ['.tsbuildinfo'],
  exceptions: [],
};
