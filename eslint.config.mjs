/**
 * ESLint Configuration for GO Automation Monorepo
 * Based on Google TypeScript Style Guide (ts.dev/style)
 * ESLint 9 Flat Config
 */

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

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
      '**/*.js',
      '**/*.d.ts',
      '**/*.mjs',
      '.eslintrc.cjs',
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
    },
  },

  // CLI entry points - allow console
  {
    files: ['**/src/index.ts', '**/src/main.ts', '**/cli.ts'],
    rules: {
      'no-console': 'off',
    },
  }
);
