import js from '@eslint/js';
import node from 'eslint-plugin-n';
import promise from 'eslint-plugin-promise';
import security from 'eslint-plugin-security';
import globals from 'globals';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '.stryker-tmp/**']
  },
  js.configs.recommended,
  node.configs['flat/recommended-module'],
  promise.configs['flat/recommended'],
  security.configs.recommended,
  {
    rules: {
      'security/detect-object-injection': 'off',
      'security/detect-possible-timing-attacks': 'off'
    }
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname
      },
      globals: globals.node
    },
    plugins: {
      '@typescript-eslint': tseslint
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      'no-redeclare': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/no-redeclare': 'error',
      'n/no-missing-import': 'off'
    }
  },
  {
    files: ['*.js', 'scripts/**/*.mjs', 'tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node
    },
    rules: {
      'security/detect-non-literal-fs-filename': 'off'
    }
  },
  {
    files: ['tests/**/*.mjs'],
    rules: {
      'n/no-missing-import': 'off'
    }
  },
  {
    files: ['tests/integration/runtime-deno-smoke.mjs'],
    languageOptions: {
      globals: {
        Deno: 'readonly'
      }
    }
  },
  {
    files: ['examples/**/*.mjs'],
    rules: {
      'n/no-missing-import': 'off'
    }
  }
];
