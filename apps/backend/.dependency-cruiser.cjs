/**
 * Architecture validation (Coding Standards §2, Folder Structure §2, Phase 2
 * Definition of Done: "architecture validation" is a mechanically-checked
 * gate, not a reviewer's memory). Enforces the two structural rules the whole
 * modular-monolith design depends on:
 *
 *   1. A module's `domain/` layer never imports a framework/infra package —
 *      it must stay framework-free so provider swaps and future
 *      service-extraction stay mechanical (Architecture §1).
 *   2. No module reaches into another module's `domain/` or `infrastructure/`
 *      internals directly — cross-module access only through the target
 *      module's `interface/` (its public Nest module + exports), never a
 *      raw relative import into someone else's internals.
 *
 * Rule 2 is generated per-module below rather than expressed with a single
 * cross-field regex backreference — dependency-cruiser's from/to path
 * matching does not share capture groups between the two the way a naive
 * `\1` backreference implies, which was verified empirically (it silently
 * over-matched, including same-module access) before this rewrite.
 *
 * Run via `pnpm arch:validate`; wired into CI (.github/workflows/ci.yml) as a
 * required check, not an optional lint warning.
 */
const MODULES = [
  'identity',
  'trip',
  'farepolicy',
  'trust',
  'reward',
  'advertising',
  'dataquality',
  'configuration',
  'feature',
  'admin',
];

const noCrossModuleRules = MODULES.map((moduleName) => ({
  name: `no-cross-module-access-to-${moduleName}-internals`,
  severity: 'error',
  comment: `Only src/modules/${moduleName}/interface (or the module's own files) may import its domain/ or infrastructure/ — every other module must go through its interface/ exports (Coding Standards §2).`,
  from: { path: '^src/modules/(?!' + moduleName + '/)' },
  to: { path: `^src/modules/${moduleName}/(domain|infrastructure)/` },
}));

module.exports = {
  forbidden: [
    {
      name: 'domain-must-be-framework-free',
      severity: 'error',
      comment:
        'src/modules/*/domain must never import a NestJS or TypeORM package — domain logic must be framework-free (Architecture §1, Coding Standards §2).',
      from: { path: '^src/modules/[^/]+/domain' },
      to: { path: '^node_modules/(@nestjs|typeorm)' },
    },
    ...noCrossModuleRules,
    {
      name: 'no-circular-dependencies',
      severity: 'error',
      comment: 'Circular imports indicate an unresolved boundary violation somewhere in the chain.',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default'] },
  },
};
