/**
 * GO AI Client - Configuration Module
 *
 * Contains script metadata and parameters definition.
 */

import { type GOConfigParameterOptions, GOConfigParameterType, type GOScriptMetadata } from '@go-automation/go-script';

/**
 * Script metadata
 */
export const scriptMetadata: GOScriptMetadata = {
  name: 'GO AI Client',
  version: '1.0.0',
  description: 'Local CLI that invokes GO-AI (direct Bedrock or via deployed Lambda)',
  authors: ['Team GO - Gestione Operativa'],
};

/**
 * Script parameter definitions
 */
export const scriptParameters: ReadonlyArray<GOConfigParameterOptions> = [
  {
    name: 'hat',
    type: GOConfigParameterType.STRING,
    description: 'AI hat to use (e.g. gherkin, alarm-diagnosis)',
    required: false,
    aliases: ['h'],
  },
  {
    name: 'input',
    type: GOConfigParameterType.STRING,
    description: 'Input text or path to a file',
    required: false,
    aliases: ['i'],
  },
  {
    name: 'go.ai.mode',
    type: GOConfigParameterType.STRING,
    description: "Invocation mode: 'direct' (Bedrock) or 'lambda'",
    required: false,
    defaultValue: 'direct',
    aliases: ['m'],
  },
  {
    name: 'go.ai.lambdaName',
    type: GOConfigParameterType.STRING,
    description: 'Lambda function name (used in lambda mode)',
    required: false,
    defaultValue: 'go-ai-prod',
  },
  {
    name: 'aws.region',
    type: GOConfigParameterType.STRING,
    description: 'AWS region',
    required: false,
    defaultValue: 'eu-south-1',
  },
  {
    name: 'aws.profile',
    type: GOConfigParameterType.STRING,
    description: 'AWS SSO profile name',
    required: false,
    defaultValue: 'sso_pn-analytics',
  },
] as const;
