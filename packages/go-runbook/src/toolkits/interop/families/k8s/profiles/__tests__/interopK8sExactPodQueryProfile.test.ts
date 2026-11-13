import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { INTEROP_K8S_QUERY_PROFILE } from '../INTEROP_K8S_QUERY_PROFILE.js';
import { interopK8sExactPodQueryProfile } from '../interopK8sExactPodQueryProfile.js';

const BASE = { applicationLogsQueryProfileId: 'example-application-log' };

describe('interopK8sExactPodQueryProfile', () => {
  it('keeps the ids and the standard CID tracker, with the ids in the same key order', () => {
    const profile = interopK8sExactPodQueryProfile('example', BASE);
    assert.deepStrictEqual(Object.keys(profile), Object.keys(INTEROP_K8S_QUERY_PROFILE));
    assert.equal(profile.id, 'example');
    assert.equal(profile.applicationLogsQueryProfileId, 'example-application-log');
    assert.equal(profile.cidTrackerQueryProfileId, INTEROP_K8S_QUERY_PROFILE.cidTrackerQueryProfileId);
    assert.equal(profile.buildCidTrackerQuery, INTEROP_K8S_QUERY_PROFILE.buildCidTrackerQuery);
  });

  it('builds the error-filter form on the escaped exact pod', () => {
    const query = interopK8sExactPodQueryProfile('example', BASE).buildApplicationLogsQuery('pod"\\x');
    assert.equal(
      query,
      [
        'filter (log like /ERROR/ or stream = "stderr")',
        '| filter @logStream not like /adot-collector/',
        '| filter pod_app = "pod\\"\\\\x"',
        '| parse @message "[CID=*]" as cid',
        '| display @timestamp, pod_app, cid, @message',
        '| sort @timestamp asc',
      ].join('\n'),
    );
  });

  it('adds the stream columns and the fixed namespace', () => {
    const query = interopK8sExactPodQueryProfile('example', {
      ...BASE,
      display: 'cid-with-stream',
      namespace: 'prod',
    }).buildApplicationLogsQuery('pod');
    assert.match(query, /^\| filter pod_namespace = "prod" and pod_app = "pod"$/mu);
    assert.match(query, /^\| display @timestamp, pod_app, @logStream, stream, cid, log, @message$/mu);
  });

  it('builds the fields form', () => {
    const query = interopK8sExactPodQueryProfile('example', { ...BASE, form: 'fields' }).buildApplicationLogsQuery(
      'pod',
    );
    assert.ok(query.startsWith('fields @timestamp, pod_app, pod_namespace, @logStream, stream, log, @message\n'));
    assert.match(query, /^\| filter log like \/ERROR\/ or stream = "stderr"$/mu);
    assert.doesNotMatch(query, /display/u);
  });

  it('orders the dated CID tracker by the date in the log line', () => {
    const profile = interopK8sExactPodQueryProfile('example', {
      ...BASE,
      datedCidTracker: { queryProfileId: 'example-cid-tracker' },
    });
    assert.equal(profile.cidTrackerQueryProfileId, 'example-cid-tracker');
    const query = profile.buildCidTrackerQuery('cid"x');
    assert.match(query, /^\| filter cid = "cid\\"x"$/mu);
    assert.match(query, /^\| parse log \/\(\?<date>\^\[\^\\s\]\+\)\/$/mu);
    assert.match(query, /^\| sort date asc$/mu);
  });
});
