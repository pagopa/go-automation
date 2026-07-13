import type { InteropAlarmContext } from '../types/index.js';

interface InteropCloudWatchLogsQuery {
  readonly logGroup: string;
  readonly query: string;
}

export interface ApplicationLogsErrorsQuery extends InteropCloudWatchLogsQuery {
  readonly podApp: string;
}

export interface CidTrackerQuery extends InteropCloudWatchLogsQuery {
  readonly cid: string;
}

export function buildApplicationLogsErrorsQuery(context: InteropAlarmContext): ApplicationLogsErrorsQuery {
  return {
    podApp: context.podApp,
    logGroup: context.logGroup,
    query: `
# LG: ${context.logGroup}
fields @timestamp, @message
| sort @timestamp asc
| filter (@message like /ERROR/ or stream = "stderr")
| filter @logStream not like /adot-collector/
| filter pod_app like /${context.podApp}/
| parse log 'CID=*]' as cid
| display @timestamp, pod_app, cid, @message
  `,
  };
}

export function buildCidTrackerQuery(context: InteropAlarmContext, cid: string): CidTrackerQuery {
  return {
    cid,
    logGroup: context.logGroup,
    query: `
# LG: ${context.logGroup}
fields @timestamp, @message
| sort @timestamp asc
| parse @message "[CID=*]" as cid
| filter cid= "${cid}"
| display @timestamp, pod_app, cid, @message
   `,
  };
}
