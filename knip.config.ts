import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  workspaces: {
    // Shared libraries
    'packages/go-common': {
      project: ['src/**/*.ts'],
    },
    'packages/go-runbook': {
      project: ['src/**/*.ts'],
    },
    'packages/go-send': {
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
    // SEND script with cron entry point
    'scripts/send/send-monitor-tpp-messages': {
      entry: ['src/cron.ts'],
      project: ['src/**/*.ts'],
    },
    // INTEROP scripts
    'scripts/interop/*': {
      project: ['src/**/*.ts'],
    },
    // Lambda functions
    'functions/*': {
      entry: ['src/handler.ts'],
      project: ['src/**/*.ts'],
    },
  },
  ignore: [
    '**/artifacts/**',
    // Barrel index.ts files: re-export hubs for module organization.
    // knip flags them as unused because their parent barrel re-exports transitively.
    '**/index.ts',
  ],
  ignoreDependencies: [
    // yaml is consumed transitively by go-common GOYAMLParser at runtime
    'yaml',
    // ESLint plugins used in flat config (eslint.config.mjs)
    '@typescript-eslint/eslint-plugin',
    '@typescript-eslint/parser',
    // Bundled into go-AILambda via esbuild — used transitively by @go-automation/go-ai
    '@aws-sdk/client-bedrock-runtime',
    '@aws-sdk/credential-provider-ini',
  ],
  ignoreBinaries: [
    // Used in CI security workflow
    'license-checker',
  ],
};

export default config;
