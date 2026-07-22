import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // In Vitest 4, specifying `include` globs makes every matching file count
      // toward coverage (even those no test imports), so untested in-scope files
      // show as 0% and the denominator is real. (The old `all: true` flag was
      // removed in v4 — `include` now provides that behavior.)
      reporter: ['text-summary', 'html', 'json-summary', 'lcov'],
      reportsDirectory: 'coverage',
      // In-scope = business logic only, and only code committed to git so CI
      // (fresh checkout) matches local. That means root lib/** plus each core
      // module's lib/**. modules-custom/* is untracked (local-only) and is
      // intentionally NOT covered here. React components, pages, and thin
      // API-route glue are also out of scope for this effort.
      include: [
        'lib/**/*.ts',
        'modules-core/**/lib/**/*.ts',
      ],
      exclude: [
        '**/*.d.ts',
        '**/types.ts',
        'lib/types/**',
        'lib/**/*-types.ts', // module-types, submenu-types, install-types
        'lib/generated/**', // auto-generated registries
        'lib/db/schema/**', // Drizzle schema definitions
        'lib/db/setup-sql.ts', // generated SQL export
        'lib/theme/fonts.ts', // next/font, no logic
        'lib/theme/index.ts', // barrel re-export (export *) — no coverable statements; pulls in a React client component
        'lib/auth-client.ts', // browser-only Better Auth client
        'modules-core/module-template/**', // scaffold template, not a live module
      ],
      // Ratchet floor: only ever raise these (via `pnpm coverage:bump`), never
      // lower. A drop below fails CI. Current in-scope coverage is ~99.6% lines /
      // ~97.6% branches; the small remainder is genuinely-unreachable code
      // (node-only guards, V8 structural sub-expressions, and safety limits).
      thresholds: {
        lines: 99,
        functions: 99,
        branches: 97,
        statements: 99,
      },
    },
  },
  resolve: {
    alias: [
      // @/modules/* mirrors tsconfig: modules-custom takes priority, fall back to modules-core
      { find: /^@\/modules\/(.*)$/, replacement: path.resolve(__dirname, 'modules-core/$1') },
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, '$1') },
    ],
  },
})
