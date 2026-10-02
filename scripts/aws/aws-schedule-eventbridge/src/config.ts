/**
 * AWS Schedule EventBridge - Configuration Module
 *
 * Contains script metadata and parameters definition.
 */

import { Core } from '@go-automation/go-common';

import { SCHEDULE_ACTIONS } from './types/index.js';
import { isScheduleAction } from './libs/isScheduleAction.js';
import { SCHEDULE_STATES, isScheduleState } from './libs/isScheduleState.js';

/**
 * Script metadata
 */
export const scriptMetadata: Core.GOScriptMetadata = {
  name: 'AWS Schedule EventBridge',
  version: '1.0.0',
  description:
    'Operates on Amazon EventBridge Scheduler schedules across several AWS accounts - list, describe, enable and disable one schedule fleet-wide.',
  authors: ['Team GO - Gestione Operativa'],
};

/**
 * Script parameter definitions
 */
export const scriptParameters: ReadonlyArray<Core.GOConfigParameterOptions> = [
  {
    name: 'aws.profiles',
    type: Core.GOConfigParameterType.STRING_ARRAY,
    description: 'AWS SSO profile names, one per account to sweep (comma-separated)',
    required: true,
    aliases: ['aps'],
  },
  {
    name: 'aws.region',
    type: Core.GOConfigParameterType.STRING,
    description: 'AWS region hosting the schedules',
    required: false,
    defaultValue: 'eu-south-1',
    aliases: ['ar'],
  },
  {
    name: 'action',
    type: Core.GOConfigParameterType.STRING,
    description: `Action to perform: ${SCHEDULE_ACTIONS.join(', ')}`,
    required: true,
    aliases: ['a'],
    validator: (value) =>
      isScheduleAction(String(value)) || `Invalid action "${String(value)}". Valid: ${SCHEDULE_ACTIONS.join(', ')}`,
  },
  {
    name: 'schedule.name',
    type: Core.GOConfigParameterType.STRING,
    description: 'Name of the schedule to target (required for describe, enable and disable)',
    required: false,
    aliases: ['n'],
  },
  {
    name: 'schedule.group',
    type: Core.GOConfigParameterType.STRING,
    description: 'Schedule group owning the schedule',
    required: false,
    defaultValue: 'default',
    aliases: ['g'],
  },
  {
    name: 'name.prefix',
    type: Core.GOConfigParameterType.STRING,
    description: 'Name prefix filter, applied by the list action only',
    required: false,
    aliases: ['p'],
  },
  {
    name: 'state',
    type: Core.GOConfigParameterType.STRING,
    description: `State filter, applied by the list action only: ${SCHEDULE_STATES.join(', ')}`,
    required: false,
    aliases: ['s'],
    validator: (value) =>
      isScheduleState(String(value)) || `Invalid state "${String(value)}". Valid: ${SCHEDULE_STATES.join(', ')}`,
  },
  {
    name: 'yes',
    type: Core.GOConfigParameterType.BOOL,
    description: 'Skip the interactive confirmation that covers the whole batch of accounts',
    required: false,
    defaultValue: false,
    aliases: ['y'],
  },
  {
    name: 'fail.on.missing',
    type: Core.GOConfigParameterType.BOOL,
    description: 'Treat an account that does not have the schedule as a failure instead of drift',
    required: false,
    defaultValue: false,
    aliases: ['fom'],
  },
] as const;
