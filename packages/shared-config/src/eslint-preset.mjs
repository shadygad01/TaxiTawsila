// Shared ESLint flat-config preset (Folder Structure §5, Coding Standards §2).
// Apps extend this array and append their own boundary/architecture rules
// (e.g. apps/backend adds dependency-cruiser / domain-layer import restrictions).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export const sharedConfig = tseslint.config(
  {
    ignores: ['**/dist/**', '**/build/**', '**/.turbo/**', '**/node_modules/**', '**/coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // Test files legitimately need loose typing for partial repository/service
    // mocks (Coding Standards §9) — this is the one place `any` is a
    // pragmatic, reviewed exception rather than a discipline gap.
    files: ['**/*.spec.ts', '**/*.spec.tsx', '**/test/**/*.ts', '**/test/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Tool config files (jest.config.js, .dependency-cruiser.cjs, ...) run
    // directly under Node/CommonJS, outside any tsconfig — they need Node's
    // CommonJS globals, which the base js/ts configs above don't provide.
    files: ['**/*.config.js', '**/*.config.cjs', '**/.*.cjs'],
    languageOptions: {
      globals: {
        module: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        console: 'readonly',
      },
    },
  },
);

export default sharedConfig;
