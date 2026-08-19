import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier'

// eslint-config-next@16 ships native flat-config arrays, so we spread them
// directly — no @eslint/eslintrc / FlatCompat bridge needed. Prettier goes
// LAST so it turns off every stylistic rule that would fight the formatter.
const eslintConfig = [
  // Global ignores — build output, generated code, and static/runtime assets.
  {
    ignores: [
      '.next/**',
      'coverage/**',
      'public/**',
      'data/**',
      '.ari/**',
      'next-env.d.ts',
      // Auto-generated — never hand-edited (see scripts/generate-module-registry.js).
      'lib/generated/**',
      'lib/db/schema/schema.ts',
      'lib/db/schema/relations.ts',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  prettier,
  // --- Next 16 rule-severity policy (must stay last so it wins) ---
  // The eslint-config-next 15 -> 16 bump flipped these rules to `error` under
  // otherwise-unchanged, previously-passing code. Downgrade to `warn` so they
  // stay visible for incremental cleanup without failing lint. (react-hooks v6
  // "React Compiler" rules; rules-of-hooks intentionally stays at its default.)
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/error-boundaries': 'warn',
    },
  },
  {
    // Tests legitimately use `any` / bare `Function` for mocks and stubs.
    files: ['tests/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
    },
  },
  {
    // CommonJS by design (package.json has no "type": "module"). require() is
    // correct here -- rewriting to ESM would break the installer / build tooling.
    files: ['scripts/**', 'tailwind.config.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]

export default eslintConfig
