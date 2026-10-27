import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  workspaces: {
    // Shared libraries
    'packages/go-ai': {
      project: ['src/**/*.ts'],
    },
    'packages/go-common': {
      project: ['src/**/*.ts'],
    },
    'packages/go-execute-runbook-contracts': {
      project: ['src/**/*.ts'],
    },
    'packages/go-watchtower-client': {
      project: ['src/**/*.ts'],
    },
    'packages/go-watchtower-runbook': {
      project: ['src/**/*.ts'],
    },
    'packages/go-cli': {
      project: ['src/**/*.ts'],
    },
    'packages/go-runbook': {
      project: ['src/**/*.ts'],
    },
    'packages/go-send': {
      project: ['src/**/*.ts'],
    },
    // AWS scripts
    'scripts/aws/*': {
      project: ['src/**/*.ts'],
    },
    // GO scripts
    'scripts/go/*': {
      project: ['src/**/*.ts'],
    },
    // SEND scripts (default entry: src/index.ts, discovered automatically)
    'scripts/send/*': {
      project: ['src/**/*.ts'],
    },
    // Lambda functions
    'functions/*': {
      project: ['src/**/*.ts'],
    },
    'infra/*': {
      project: ['src/**/*.ts'],
    },
  },
  ignore: [
    // Archived scripts and functions: kept for reference, outside the workspace
    'archive/**',
    // Barrel index.ts files: re-export hubs for module organization.
    // knip flags them as unused because their parent barrel re-exports transitively.
    '**/index.ts',
    // Generated contract types expose the complete upstream OpenAPI surface.
    'packages/go-watchtower-client/src/generated/**',
  ],
  ignoreDependencies: [
    // ESLint plugins used in flat config (eslint.config.mjs)
    '@typescript-eslint/eslint-plugin',
    '@typescript-eslint/parser',
    // Bundled into go-AILambda via esbuild — used transitively by @go-automation/go-ai
    '@aws-sdk/client-bedrock-runtime',
    '@aws-sdk/credential-provider-ini',
  ],
};

export default config;
