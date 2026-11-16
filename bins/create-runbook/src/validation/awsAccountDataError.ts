import type { GeneratedFile } from '../generate/scaffoldRunbook.js';

/** Synthetic account ids allowed in examples (EVO-AWSACCT-OPUS-01 §9). */
const SYNTHETIC_ACCOUNT_IDS: ReadonlySet<string> = new Set(['000000000000', '123456789012']);
const ACCOUNT_ID = /(?<![0-9])[0-9]{12}(?![0-9])/gu;
const SSO_PROFILE = /(?<![A-Za-z0-9_.-])sso_[A-Za-z0-9_.-]+/u;

/**
 * Checks that the generated runbook carries no AWS account id and no SSO profile name:
 * runbooks ship in the published `@pagopa/go-runbook` (EVO-AWSACCT-OPUS-01). A runbook
 * that reads other accounts declares logical accounts (`<product>/<account>`) instead.
 *
 * @param files - Files about to be written
 * @returns An error message naming the first offending file, or `undefined` when clean
 */
export function awsAccountDataError(files: ReadonlyArray<GeneratedFile>): string | undefined {
  for (const file of files) {
    const accountId = [...file.content.matchAll(ACCOUNT_ID)].find((match) => !SYNTHETIC_ACCOUNT_IDS.has(match[0]));
    if (accountId !== undefined || SSO_PROFILE.test(file.content)) {
      return (
        `${file.path}: il runbook generato contiene un account id AWS o un nome di profilo. ` +
        'Il codice dei runbook è pubblicato: dichiara account logici (es. SEND_ACCOUNTS.core) e metti gli id ' +
        'nella rubrica aws.account.directory (docs/RUNBOOKENGINE.md §7.1, EVO-AWSACCT-OPUS-01).'
      );
    }
  }
  return undefined;
}
