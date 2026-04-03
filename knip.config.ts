import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  workspaces: {
    // Shared library
    'packages/go-common': {
      entry: ['src/index.ts'],
      project: ['src/**/*.ts'],
      ignore: ['src/**/__fixtures__/**'],
    },
    // GO scripts
    'scripts/go/*': {
      project: ['src/**/*.ts'],
    },
    // SEND scripts
    'scripts/send/*': {
      project: ['src/**/*.ts'],
    },
    // INTEROP scripts
    'scripts/interop/*': {
      project: ['src/**/*.ts'],
    },
    // Lambda functions
    'functions/*': {
      entry: ['src/handler.ts', 'src/index.ts'],
      project: ['src/**/*.ts'],
    },
  },
  ignore: ['**/artifacts/**'],
  ignoreDependencies: [
    // tsx is used as loader in dev scripts (pnpm dev)
    'tsx',
  ],
};

export default config;
