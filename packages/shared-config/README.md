# @taxitawsila/shared-config

Single source of truth for shared ESLint, TypeScript, and Prettier configuration across the monorepo (Folder Structure §5).

- `tsconfig.base.json` — strict compiler options every app/package extends.
- `src/eslint-preset.mjs` — shared flat-config rule set; apps import `sharedConfig` and append their own layering/boundary rules.
- `prettier-preset.json` — formatting rules, re-exported at the repo root via `.prettierrc.cjs`.

This package has no tests or lintable source of its own — it is configuration, not logic.
