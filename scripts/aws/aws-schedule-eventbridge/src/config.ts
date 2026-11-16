/**
 * AWS Schedule EventBridge - Configuration Module
 *
 * Contains script metadata and parameters definition.
 */

import { type GOConfigParameterOptions, GOConfigParameterType, type GOScriptMetadata } from '@go-automation/go-script';

import { SCHEDULE_ACTIONS } from './types/index.js';
import { isScheduleAction } from './libs/isScheduleAction.js';
import { SCHEDULE_STATES, isScheduleState } from './libs/isScheduleState.js';

/**
 * Script metadata
 */
export const scriptMetadata: GOScriptMetadata = {
  name: 'AWS Schedule EventBridge',
  version: '1.0.0',
  description:
    'Operates on Amazon EventBridge Scheduler schedules across several AWS accounts - list, describe, enable and disable one schedule fleet-wide.',
  authors: ['Team GO - Gestione Operativa'],
};

/**
 * Script parameter definitions
 */
export const scriptParameters: ReadonlyArray<GOConfigParameterOptions> = [
  {
    name: 'aws.profiles',
    type: GOConfigParameterType.STRING_ARRAY,
    description: 'AWS SSO profile names, one per account to sweep (comma-separated)',
    required: true,
    aliases: ['aps'],
    // `required` only rejects undefined, and the parser trims empty entries
    // away, so `--aws-profiles ''` or `--aws-profiles ,` arrives here as an
    // empty array. An empty profile list makes the framework fall back to the
    // default credential chain, which would point a fleet mutation at whatever
    // account happens to be ambient.
    validator: (value) =>
      (Array.isArray(value) && value.length > 0) ||
      'At least one AWS profile is required: an empty --aws-profiles would fall back to the default credential chain',
  },
  {
    name: 'aws.region',
    type: GOConfigParameterType.STRING,
    description: 'AWS region hosting the schedules',
    required: false,
    defaultValue: 'eu-south-1',
    aliases: ['ar'],
  },
  {
    name: 'action',
    type: GOConfigParameterType.STRING,
    description: `Action to perform: ${SCHEDULE_ACTIONS.join(', ')}`,
    required: true,
    aliases: ['a'],
    validator: (value) =>
      isScheduleAction(String(value)) || `Invalid action "${String(value)}". Valid: ${SCHEDULE_ACTIONS.join(', ')}`,
  },
  {
    name: 'schedule.name',
    type: GOConfigParameterType.STRING,
    description: 'Name of the schedule to target (required for describe, enable and disable)',
    required: false,
    aliases: ['n'],
  },
  {
    name: 'schedule.group',
    type: GOConfigParameterType.STRING,
    description: 'Schedule group owning the schedule',
    required: false,
    defaultValue: 'default',
    aliases: ['g'],
  },
  {
    name: 'name.prefix',
    type: GOConfigParameterType.STRING,
    description: 'Name prefix filter, applied by the list action only',
    required: false,
    aliases: ['p'],
  },
  {
    name: 'state',
    type: GOConfigParameterType.STRING,
    description: `State filter, applied by the list action only: ${SCHEDULE_STATES.join(', ')}`,
    required: false,
    aliases: ['s'],
    validator: (value) =>
      isScheduleState(String(value)) || `Invalid state "${String(value)}". Valid: ${SCHEDULE_STATES.join(', ')}`,
  },
  {
    name: 'yes',
    type: GOConfigParameterType.BOOL,
    description: 'Skip the interactive confirmation that covers the whole batch of accounts',
    required: false,
    defaultValue: false,
    aliases: ['y'],
  },
  {
    name: 'fail.on.missing',
    type: GOConfigParameterType.BOOL,
    description: 'Treat an account that does not have the schedule as a failure instead of drift',
    required: false,
    defaultValue: false,
    aliases: ['fom'],
  },
] as const;
