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
]

export default eslintConfig
