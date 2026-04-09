/**
 * ESLint Configuration for GO Automation Monorepo
 * Based on Google TypeScript Style Guide (ts.dev/style)
 * ESLint 9 Flat Config
 */

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import eslintPluginSecurity from 'eslint-plugin-security';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

/**
 * Custom plugin: enforces that main.ts only contains the main() function.
 * All helper functions, display logic, and utilities should live in libs/.
 */
const goAutomationPlugin = {
  meta: { name: 'go-automation' },
  rules: {
    'no-extra-functions-in-main': {
      meta: {
        type: 'suggestion',
        docs: {
          description:
            'Disallow function declarations other than main() in main.ts. ' +
            'Helper functions should be moved to dedicated files under libs/.',
        },
        messages: {
          moveToLibs:
            'Move "{{ name }}" to a dedicated file under libs/. ' +
            'main.ts should only contain the main() function.',
        },
        schema: [],
      },
      create(context) {
        return {
          // function foo() / export function foo() / export async function foo()
          FunctionDeclaration(node) {
            if (node.id != null && node.id.name !== 'main') {
              context.report({
                node: node.id,
                messageId: 'moveToLibs',
                data: { name: node.id.name },
              });
            }
          },
          // const foo = () => {} / export const foo = async () => {}
          VariableDeclarator(node) {
            if (
              node.init != null &&
              (node.init.type === 'ArrowFunctionExpression' ||
                node.init.type === 'FunctionExpression') &&
              (node.parent.parent.type === 'Program' ||
                node.parent.parent.type === 'ExportNamedDeclaration') &&
              node.id.type === 'Identifier'
            ) {
              context.report({
                node: node.id,
                messageId: 'moveToLibs',
                data: { name: node.id.name },
              });
            }
          },
        };
      },
    },
  },
};

export default tseslint.config(
  // Base ESLint recommended
  eslint.configs.recommended,

  // TypeScript ESLint recommended
  ...tseslint.configs.recommendedTypeChecked,

  // Global ignores
  {
    ignores: [
      'node_modules/',
      '**/node_modules/',
      'dist/',
      '**/dist/',
      'build/',
      'coverage/',
      'artifacts/',
      '**/artifacts/',
      '**/*.js',
      '**/*.d.ts',
      '**/*.mjs',
      '.eslintrc.cjs',
      'knip.config.ts',
    ],
  },

  // Main configuration for TypeScript files
  {
    files: ['**/*.ts'],

    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2024,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },

    rules: {
      // ===== Naming Conventions =====
      '@typescript-eslint/naming-convention': [
        'error',
        // Classes, interfaces, types: UpperCamelCase
        {
          selector: ['class', 'interface', 'typeAlias', 'enum', 'typeParameter'],
          format: ['PascalCase'],
        },
        // Variables, functions, parameters: lowerCamelCase
        {
          selector: ['variable', 'function', 'parameter', 'method', 'accessor'],
          format: ['camelCase'],
          leadingUnderscore: 'allow',
        },
        // Constants: CONSTANT_CASE or camelCase or PascalCase
        {
          selector: 'variable',
          modifiers: ['const', 'global'],
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
        },
        // Private fields: camelCase (NOT _underscore)
        {
          selector: 'memberLike',
          modifiers: ['private'],
          format: ['camelCase'],
          leadingUnderscore: 'forbid',
        },
      ],

      // ===== Type System =====
      // No any (use unknown instead)
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',

      // Array types: simple[] for simple types
      '@typescript-eslint/array-type': [
        'error',
        {
          default: 'array',
          readonly: 'generic',
        },
      ],

      // Prefer interface over type for objects
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],

      // Explicit function return types for public APIs
      '@typescript-eslint/explicit-function-return-type': [
        'warn',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
        },
      ],

      // ===== Null & Undefined Handling =====
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',

      // ===== Iteration Rules =====
      '@typescript-eslint/prefer-for-of': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ForInStatement',
          message: 'Use for...of, Object.keys(), or Object.entries() instead of for...in',
        },
      ],

      // ===== Import/Export Rules =====
      // No unused imports/vars
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // ===== Functions & Methods =====
      'func-style': ['error', 'declaration', { allowArrowFunctions: true }],

      // ===== Control Flow =====
      'default-case': 'error',
      'default-case-last': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],

      // ===== Prohibited Patterns =====
      '@typescript-eslint/no-namespace': 'error',
      '@typescript-eslint/no-require-imports': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': 'allow-with-description',
          'ts-expect-error': 'allow-with-description',
          minimumDescriptionLength: 10,
        },
      ],
      '@typescript-eslint/no-non-null-assertion': 'warn',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-array-constructor': 'error',
      'no-new-func': 'error',

      // ===== Code Quality =====
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-template': 'error',
      'no-useless-concat': 'error',

      // Async/Promise best practices
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/promise-function-async': 'error',
      'no-async-promise-executor': 'error',

      '@typescript-eslint/no-useless-constructor': 'error',

      // ===== Performance =====
      'prefer-regex-literals': 'error',

      // ===== Readonly & Immutability =====
      '@typescript-eslint/prefer-readonly': 'error',
    },
  },

  // Test files - relaxed rules
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },

  // CLI entry points and local test harnesses - allow console
  {
    files: ['**/src/index.ts', '**/src/main.ts', '**/cli.ts', '**/src/test-local.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // ===== Security: detect vulnerable patterns =====
  eslintPluginSecurity.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      'security/detect-eval-with-expression': 'warn',
      'security/detect-child-process': 'warn',
      'security/detect-unsafe-regex': 'warn',
      'security/detect-non-literal-require': 'warn',
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-object-injection': 'off',
      'security/detect-new-buffer': 'warn',
      'security/detect-pseudoRandomBytes': 'warn',
      'security/detect-possible-timing-attacks': 'warn',
      'security/detect-bidi-characters': 'warn',
      'security/detect-buffer-noassert': 'warn',
      'security/detect-disable-mustache-escape': 'warn',
      'security/detect-no-csrf-before-method-override': 'warn',
      'security/detect-non-literal-regexp': 'off',
    },
  },

  // go-common IS the I/O boundary layer — non-literal fs paths are expected and safe here.
  // Scripts are blocked from using fs directly via no-restricted-syntax.
  {
    files: ['packages/go-common/**/*.ts'],
    rules: {
      'security/detect-non-literal-fs-filename': 'off',
    },
  },

  // Bins tooling - infrastructure tools that operate on the filesystem by design
  {
    files: ['bins/**/*.ts'],
    rules: {
      'security/detect-non-literal-fs-filename': 'off',
      'no-console': 'off',
    },
  },

  // ===== Scripts: enforce go-common usage =====
  // Prevents scripts from reimplementing features already provided by @go-automation/go-common.
  // Bypass with: // eslint-disable-next-line <rule> -- <justification>
  // See CONVENTIONS.md for the full mapping of go-common capabilities.
  {
    files: ['scripts/**/*.ts'],
    ignores: ['**/*.test.ts', '**/*.spec.ts', '**/cron.ts'],
    rules: {
      // ---- Restricted third-party packages ----
      'no-restricted-imports': [
        'error',
        {
          paths: [
            // CSV processing → GOCSVListExporter / GOCSVListImporter
            {
              name: 'csv-stringify',
              message: 'Use GOCSVListExporter from @go-automation/go-common. See CONVENTIONS.md.',
            },
            {
              name: 'csv-stringify/sync',
              message: 'Use GOCSVListExporter from @go-automation/go-common. See CONVENTIONS.md.',
            },
            {
              name: 'csv-parse',
              message: 'Use GOCSVListImporter from @go-automation/go-common. See CONVENTIONS.md.',
            },
            {
              name: 'csv-parse/sync',
              message: 'Use GOCSVListImporter from @go-automation/go-common. See CONVENTIONS.md.',
            },
            // Prompts → GOPrompt
            {
              name: 'prompts',
              message: 'Use GOPrompt from @go-automation/go-common. See CONVENTIONS.md.',
            },
            {
              name: 'enquirer',
              message: 'Use GOPrompt from @go-automation/go-common. See CONVENTIONS.md.',
            },
            {
              name: 'inquirer',
              message: 'Use GOPrompt from @go-automation/go-common. See CONVENTIONS.md.',
            },
            // Spinners / progress → GOMultiSpinner / GOLoadingBar
            {
              name: 'ora',
              message: 'Use GOMultiSpinner or GOLoadingBar from @go-automation/go-common. See CONVENTIONS.md.',
            },
            {
              name: 'cli-spinners',
              message: 'Use GOMultiSpinner or GOLoadingBar from @go-automation/go-common. See CONVENTIONS.md.',
            },
            // Colors → GOLogger (handles colors internally)
            {
              name: 'chalk',
              message: 'Use GOLogger from @go-automation/go-common for colored output. See CONVENTIONS.md.',
            },
            {
              name: 'kleur',
              message: 'Use GOLogger from @go-automation/go-common for colored output. See CONVENTIONS.md.',
            },
            {
              name: 'picocolors',
              message: 'Use GOLogger from @go-automation/go-common for colored output. See CONVENTIONS.md.',
            },
            {
              name: 'colorette',
              message: 'Use GOLogger from @go-automation/go-common for colored output. See CONVENTIONS.md.',
            },
            // HTTP client → GOHttpClient
            {
              name: 'undici',
              message: 'Use GOHttpClient from @go-automation/go-common. See CONVENTIONS.md.',
            },
            {
              name: 'node-fetch',
              message: 'Use GOHttpClient from @go-automation/go-common. See CONVENTIONS.md.',
            },
            {
              name: 'axios',
              message: 'Use GOHttpClient from @go-automation/go-common. See CONVENTIONS.md.',
            },
            {
              name: 'got',
              message: 'Use GOHttpClient from @go-automation/go-common. See CONVENTIONS.md.',
            },
            // CLI argument parsing → GOScript / GOConfigReader
            {
              name: 'yargs',
              message: 'Use GOScript config from @go-automation/go-common. See CONVENTIONS.md.',
            },
            {
              name: 'commander',
              message: 'Use GOScript config from @go-automation/go-common. See CONVENTIONS.md.',
            },
            {
              name: 'minimist',
              message: 'Use GOScript config from @go-automation/go-common. See CONVENTIONS.md.',
            },
            {
              name: 'meow',
              message: 'Use GOScript config from @go-automation/go-common. See CONVENTIONS.md.',
            },
            // Tables → GOTableFormatter
            {
              name: 'cli-table3',
              message: 'Use GOTableFormatter from @go-automation/go-common. See CONVENTIONS.md.',
            },
            {
              name: 'table',
              message: 'Use GOTableFormatter from @go-automation/go-common. See CONVENTIONS.md.',
            },
            // Logging → GOLogger
            {
              name: 'winston',
              message: 'Use GOLogger from @go-automation/go-common. See CONVENTIONS.md.',
            },
            {
              name: 'pino',
              message: 'Use GOLogger from @go-automation/go-common. See CONVENTIONS.md.',
            },
            {
              name: 'bunyan',
              message: 'Use GOLogger from @go-automation/go-common. See CONVENTIONS.md.',
            },
            {
              name: 'log4js',
              message: 'Use GOLogger from @go-automation/go-common. See CONVENTIONS.md.',
            },
            // YAML → go-common utilities
            {
              name: 'yaml',
              message: 'Use utilities from @go-automation/go-common. See CONVENTIONS.md.',
            },
            {
              name: 'js-yaml',
              message: 'Use utilities from @go-automation/go-common. See CONVENTIONS.md.',
            },
          ],
        },
      ],

      // ---- Restricted code patterns ----
      // Overrides global no-restricted-syntax for scripts — includes ForInStatement from global config.
      'no-restricted-syntax': [
        'error',
        // Global (inherited: must repeat because flat config replaces per-rule)
        {
          selector: 'ForInStatement',
          message: 'Use for...of, Object.keys(), or Object.entries() instead of for...in',
        },
        // File writing → use go-common exporters
        {
          selector: "CallExpression[callee.object.name='fs'][callee.property.name='writeFile']",
          message:
            'Use go-common exporters (GOFileListExporter, GOJSONListExporter, GOCSVListExporter, GOHTMLListExporter) instead of fs.writeFile. See CONVENTIONS.md.',
        },
        {
          selector: "CallExpression[callee.object.name='fs'][callee.property.name='writeFileSync']",
          message: 'Use go-common exporters instead of fs.writeFileSync. See CONVENTIONS.md.',
        },
        {
          selector: "CallExpression[callee.object.name='fs'][callee.property.name='createWriteStream']",
          message: 'Use go-common exporters instead of fs.createWriteStream. See CONVENTIONS.md.',
        },
        // File reading for import → use go-common importers
        {
          selector: "CallExpression[callee.object.name='readline'][callee.property.name='createInterface']",
          message:
            'Use go-common importers (GOJSONListImporter, GOCSVListImporter, GOFileListImporter) instead of readline. See CONVENTIONS.md.',
        },
        // Direct process.env → use GOScript config
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message:
            'Use GOScript configuration (GOConfigReader / GOConfigParameterProvider) instead of process.env. See CONVENTIONS.md.',
        },
        // Direct EventEmitter → use GOEventEmitterBase
        {
          selector: "NewExpression[callee.name='EventEmitter']",
          message:
            'Extend GOEventEmitterBase from @go-automation/go-common instead of using EventEmitter directly. See CONVENTIONS.md.',
        },
      ],
    },
  },

  // ===== main.ts structure — encourage single-responsibility =====
  // These are advisory warnings (won't block CI).
  // main.ts should only contain the main() function; everything else belongs in libs/.
  {
    files: ['scripts/**/src/main.ts'],
    plugins: { 'go-automation': goAutomationPlugin },
    rules: {
      // Only main() allowed — move helpers to libs/
      'go-automation/no-extra-functions-in-main': 'error',
      // File too long → likely has helper functions that belong in libs/
      'max-lines': [
        'error',
        { max: 200, skipBlankLines: true, skipComments: true },
      ],
      // Single function too large → split logic into libs/
      'max-lines-per-function': [
        'error',
        { max: 80, skipBlankLines: true, skipComments: true },
      ],
      // High cyclomatic complexity → too many branches, extract into libs/
      complexity: ['error', { max: 15 }],
    },
  },

  // Prettier integration - MUST be last to override other configs
  eslintPluginPrettierRecommended,
);
