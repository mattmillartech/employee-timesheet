/* ESLint config for the Vite + React + TypeScript frontend.
 * Matches the plugins already in devDependencies. Lints `src` only (see the
 * `lint` script). Type-aware rules are intentionally omitted so lint stays
 * fast and doesn't require a tsconfig project graph — `npm run typecheck`
 * (tsc --noEmit) is the type gate. */
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'react-refresh'],
  ignorePatterns: ['dist', 'node_modules', '.eslintrc.cjs'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    // Project rule: zero `any`. tsc already forbids implicit any; this catches
    // explicit ones too.
    '@typescript-eslint/no-explicit-any': 'error',
    // Honor the `_`-prefix convention for intentionally-unused bindings
    // (e.g. positional params kept for signature/documentation).
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
    ],
  },
};
