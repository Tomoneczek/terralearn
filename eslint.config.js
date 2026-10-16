import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import noUnsanitized from 'eslint-plugin-no-unsanitized';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.cache/**',
      '.scratch/**',
      'public/**',
      'meta/**',
      '*.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'no-unsanitized': noUnsanitized,
    },
    rules: {
      'no-unsanitized/method': 'error',
      'no-unsanitized/property': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  prettier,
);
